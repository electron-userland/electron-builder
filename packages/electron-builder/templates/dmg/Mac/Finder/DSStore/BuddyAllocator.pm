package Mac::Finder::DSStore::BuddyAllocator;

=head1 NAME

Mac::Finder::DSStore::BuddyAllocator - Allocate space within a file

=head1 DESCRIPTION

C<Mac::Finder::DSStore::BuddyAllocator>
implements a buddy-allocation scheme within a file. It's used by
C<Mac::Finder::DSStore> to read certain files created by the Macintosh
Finder.

The allocation methods do not perform any actual file I/O.
The contents of allocated blocks are read and written by the caller using
methods on C<BuddyAllocator::Block>.
If the C<allocate> and C<free> methods are used,
or if the C<toc> hash is modified,
C<writeMetaData> must be called for the changes to be reflected in the file.

=head1 METHODS

=cut

use strict;
use warnings;
use Carp;

our($VERSION) = '1.00';

# Debug logging. Uncomment these and all uses of them to activate.
# It might be nice to make this more easily switchable.
#our($loglevel) = 0;
#sub logf {
#    print STDERR ( ' ' x $loglevel ) . sprintf($_[0], @_[1 .. $#_ ]) . "\n";
#}

=head2 $allocator = Mac::Finder::DSStore::BuddyAllocator->open($fh)

C<open($fh)> constructs a new buddy allocator 
and initializes its state from the information in the file.
The file handle is retained by the allocator for future
operations.

=cut

sub open {
    my($class, $fh) = @_;

    binmode($fh);

    # read the file header: 32 bytes, plus a mysterious extra
    # four bytes at the front
    my($fheader);
    $fh->read($fheader, 4 + 0x20) == 0x24
	or die "Can't read file header: $!";
    my($magic1, $magic, $offset, $size, $offset2, $unk2) = unpack('N a4 NNN a16', $fheader);
    die 'bad magic' unless $magic eq 'Bud1' and $magic1 == 1;
    die 'inconsistency: two root addresses are different'
	unless $offset == $offset2;

    my($self) = {
	fh => $fh,
	unk2 => $unk2,
	fudge => 4,  # add this to offsets for some unknown reason
    };
    bless($self, ref($class) || $class);
    
    # retrieve the root/index block which contains the allocator's
    # book-keeping data
    my ($rootblock) = $self->getBlock($offset, $size);

    # parse out the offsets of all the allocated blocks
    # these are in tagged offset format (27 bits offset, 5 bits size)
    my($offsetcount, $unk3) = $rootblock->read(8, 'NN');
    # not sure what the word following the offset count is
    $self->{'unk3'} = $unk3;
    # For some reason, offsets are always stored in blocks of 256.
    my(@offsets);
    while($offsetcount > 0) {
	push(@offsets, $rootblock->read(1024, 'N256'));
	$offsetcount -= 256;
    }
    # 0 indicates an empty slot; don't need to keep those around
    while($offsets[$#offsets] == 0) { pop(@offsets); }
    grep { $_ = undef if $_ == 0 } @offsets;

    # Next, read N key/value pairs
    my($toccount) = $rootblock->read(4, 'N');
    my($toc) = {
    };
    while($toccount--) {
	my($len) = $rootblock->read(1, 'C');
	my($name) = $rootblock->read($len);
	my($value) = $rootblock->read(4, 'N');
	$toc->{$name} = $value;
    }

    $self->{'offsets'} = \@offsets;
    $self->{'toc'} = $toc;

    # Finally, read the free lists.
    my($freelists) = { };
    for(my $width = 0; $width < 32; $width ++) {
	my($blkcount) = $rootblock->read(4, 'N');
	$freelists->{$width} = [ $rootblock->read(4 * $blkcount, 'N*') ];
    }
    $self->{'freelist'} = $freelists;

    return $self;
}

=head2 $allocator = Mac::Finder::DSStore::BuddyAllocator->new($fh)

Similar to C<open>, but does not read anything from the file. This
can be used to create a new file from scratch.

=cut

sub new {
    my($cls, $fh) = @_;

    binmode($fh) if defined($fh);

    my($self) = {
	fh => $fh,
	toc => { },
	offsets => [ ],
	freelist => { },

	# And the mystery meat goes here...
	unk2 => pack('NNNN', 0x100C, 0x0087, 0x200B, 0 ),
	unk3 => 0,
	fudge => 4
    };
    bless($self, ref $cls || $cls);

    # All our freelists are empty...
    foreach my $width (0 .. 30) {
	$self->{freelist}->{$width} = [ ];
    }
    # ... except for a single 2GB block starting at 0
    $self->{freelist}->{31} = [ 0 ];

    # Allocate the header block, 2^5 bytes wide
    my($hdr) = $self->_alloc(5);
    # it had better be at offset zero
    ( $hdr == 0 ) or die;

    $self;
}

=head2 $allocator->close( )

Closes the underlying file handle.

=cut

sub close {
    my($self) = @_;
    my($fh) = $self->{fh};

    delete $self->{fh};

    $fh->close;
}

=head2 $allocator->listBlocks($verbose)

List all the blocks in order and see if there are any gaps or overlaps.
If C<$verbose> is true, then the blocks are listed to the current
output filehandle. Returns true if the allocated and free blocks
have no gaps or overlaps.

=cut

sub listBlocks {
    my($self, $verbose) = @_;
    my(%byaddr);
    my($addr, $len);

    # We store all blocks (allocated and free) in %byaddr,
    # then go through its keys in order

    # Store the implicit 32-byte block that holds the file header
    push(@{$byaddr{0}}, "5 (file header)");

    # Store all the numbered/allocated blocks from @offsets
    for my $blnum (0 .. $#{$self->{'offsets'}}) {
	my($addr_size) = $self->{'offsets'}->[$blnum];
	next unless defined $addr_size;
	$addr = $addr_size & ~0x1F;
	$len = $addr_size & 0x1F;
	push(@{$byaddr{$addr}}, "$len (blkid $blnum)");
    }

    # Store all the blocks in the freelist(s)
    for $len (keys %{$self->{'freelist'}}) {
	for $addr (@{$self->{'freelist'}->{$len}}) {
	    push(@{$byaddr{$addr}}, "$len (free)");
	}
    }

    my($gaps, $overlaps) = (0, 0);

    # Loop through the blocks in order of address
    my(@addrs) = sort {$a <=> $b} keys %byaddr;
    $addr = 0;
    while(@addrs) {
	my($next) = shift @addrs;
	if ($next > $addr) {
	    print "... ", ($next - $addr), " bytes unaccounted for\n"
		if $verbose;
	    $gaps ++;
	}
	my(@uses) = @{$byaddr{$next}};
	printf "%08x %s\n", $next, join(', ', @uses)
	    if $verbose;
	$overlaps ++ if @uses > 1;

	# strip off the length (log_2(length) really) from the info str
	($len = $uses[0]) =~ s/ .*//;
	$addr = $next + ( 1 << (0 + $len) );
    }

    ( $gaps == 0 && $overlaps == 0 );
}

=head2 $allocator->writeMetaData( )

Writes the allocator's metadata (header block and root block)
back to the file.

=cut

sub writeMetaData {
    my($self) = @_;

    # Root block nr is hardcoded to 0.
    # We don't actually care, but the DSStore btree does.
    my($blocknr) = 0;

    # Before computing the size of the rootblock to allocate it,
    # make sure it'll be large enough to hold its own (eventual)
    # allocation information.
    $self->{offsets}->[0] = undef unless exists $self->{offsets}->[0];

    my($rbs) = $self->rootBlockSize();
    $self->allocate($rbs, $blocknr);
    
    $self->writeRootblock($self->blockByNumber($blocknr, 1));

    my($blockOffset, $blockLength) = $self->blockOffset($blocknr);

    $self->{fh}->seek(0, 0);
    $self->{fh}->write(pack('N', 1)); # magic1
    $self->_sought(0)->write(pack('a4 NNN a16',
				  'Bud1', # magic
				  $blockOffset, $blockLength, $blockOffset,
				  $self->{unk2}));

    $self->{fh}->flush;
}

sub rootBlockSize {
    my($self) = @_;
    my($size);

    $size = 8;  # The offset count and the unknown field that follows it
    
    # The offset blocks, rounded up to a multiple of 256 entries
    my($offsetcount) = scalar( @{$self->{'offsets'}} );
    my($tail) = $offsetcount % 256;
    $offsetcount += 256 - $tail if ($tail);
    $size += 4 * $offsetcount;

    # The table of contents
    $size += 4; # count
    $size += (5 + length($_)) foreach keys %{$self->{'toc'}};

    # The freelists
    foreach my $width (0 .. 31) {
	$size += 4 + 4 * scalar( @{$self->{'freelist'}->{$width}} );
    }

    $size;
}

sub writeRootblock {
    my($self, $into) = @_;

    my(@offsets) = @{$self->{'offsets'}};
    
    # Write the offset count & the unknown field that follows it
    $into->write('NN', scalar(@offsets), $self->{'unk3'});
    
    # Write the offsets (using 0 to indicate an unused slot)
    $into->write('N*', map { (defined($_) && $_ > 0)? $_ : 0 } @offsets);
    
    # The offsets are always written in blocks of 256.
    my($offsetcount) = scalar(@offsets) % 256;
    if ($offsetcount > 0) {
	# Fill out the last block
	$into->write('N*', (0) x (256-$offsetcount));
    }

    # The DS_Store files only ever have one item in their
    # table of contents, so I'm not sure if it needs to be sorted or what
    my(@tockeys) = sort keys %{$self->{'toc'}};
    $into->write('N', scalar(@tockeys));
    foreach my $entry (@tockeys) {
	$into->write('C a* N', length($entry), $entry, $self->{'toc'}->{$entry});
    }
    
    # And finally the freelists
    for my $width ( 0 .. 31 ) {
	my($blks) = $self->{'freelist'}->{$width};
	$into->write('N N*', scalar(@$blks), @$blks);
    }
}

=head2 $block = $allocator->blockByNumber(blocknumber[, write])

Retrieves a block by its block number (I<aka> block ID).

If C<write> is supplied and is true, then the returned block implements the
C<write> method but not the C<read> method.

=head2 $block = $allocator->getBlock(offset, size)

Retrieves a block (a BuddyAllocator::Block instance) by offset & length.
Normally you should use C<blockByNumber> instead of this method.

=cut

sub getBlock {
    my($self, $offset, $size) = @_;

    return Mac::Finder::DSStore::BuddyAllocator::Block->new($self, $offset, $size);
}

# Retrieve a block by its block number (small integer)
sub blockByNumber {
    my($self, $id, $write) = @_;
    my($addr) = $self->{offsets}->[$id];
    return undef unless $addr;
    my($offset, $len);
    $offset = $addr & ~0x1F;
    $len = 1 << ( $addr & 0x1F );
#    print "  node id $id is $len bytes at 0x".sprintf('%x', $offset)."\n";
    if (!defined($write) || !$write) {
	return Mac::Finder::DSStore::BuddyAllocator::Block->new($self, $offset, $len);
    } else {
	return Mac::Finder::DSStore::BuddyAllocator::WriteBlock->new($self, $offset, $len);
    }
}

=head2 ( $offset, $size ) = $allocator->blockOffset(blockid)

Retrieves the file offset and size in bytes of a given block.
The offset doesn't include the 4-byte fudge.
In scalar context, just returns the offset.

=cut

sub blockOffset {
    my($self, $id) = @_;
    my($addr) = $self->{offsets}->[$id];
    croak "Block $id is not allocated" unless $addr;
    my($offset) = $addr & ~0x1F;
    return $offset unless wantarray;
    return ( $offset,  1 << ( $addr & 0x1F ) );
}

# Return freelist + index of a block's buddy in its freelist (or empty list)
sub _buddy {
    my($self, $offset, $width) = @_;
    my($freelist, $buddyaddr);

    $freelist = $self->{'freelist'}->{$width};
    $buddyaddr = $offset ^ ( 1 << $width );

    return ($freelist,
	    grep { $freelist->[$_] == $buddyaddr } 0 .. $#$freelist );
}

# Free a block, coalescing ith buddies as needed.
sub _free {
    my($self, $offset, $width) = @_;

    my($freelist, $buddyindex) = $self->_buddy($offset, $width);

    if(defined($buddyindex)) {
	# our buddy is free. Coalesce, and add the coalesced block to flist.
	my($buddyoffset) = splice(@$freelist, $buddyindex, 1);
	#&logf("Combining %x with buddy %x", $offset, $buddyoffset);
	$self->_free($offset & $buddyoffset, $width+1);
    } else {
	#&logf("Adding block %x to freelist %d", $offset, $width);
	@$freelist = sort( @$freelist, $offset );
    }
}

# Allocate a block of a specified width, splitting as needed.
sub _alloc {
    my($self, $width) = @_;
    
    #&logf("Allocating a block of width %d", $width);
    #$loglevel ++;

    my($flist) = $self->{'freelist'}->{$width};
    if (@$flist) {
	# There is a block of the desired size; return it.
	#&logf("Pulling %x from freelist", $flist->[0]); $loglevel --;
	return shift @$flist;
    } else {
	# Allocate a block of the next larger size; split it.
	my($offset) = $self->_alloc($width + 1);
	# and put the other half on the free list.
	my($buddy) = $offset ^ ( 1 << $width );
	#&logf("Splitting %x into %x and %x", $offset, $offset, $buddy);
	#$loglevel ++;
	$self->_free($buddy, $width);
	#$loglevel -= 2;
	return $offset;
    }
}

=head2 $blocknumber = $allocator->allocate($size, [$blocknumber])

Allocates or re-allocates a block to be at least C<$size> bytes long.
If C<$blocknumber> is given, the specified block will be grown or
shrunk if needed, otherwise a new block number will be chosen and
given to the allocated block.

Unlike the libc C<realloc> function, this may move a block even if the
block is not grown.

=head2 $allocator->free($blocknumer)

Releases the block number and the block associated with it back to the
block pool.

=cut

sub allocate {
    my($self, $bytes, $blocknum) = @_;
    my($offsets) = $self->{'offsets'};

    #if(defined($blocknum)) {
    #    &logf("(Re)allocating %d bytes for blkid %d", $bytes, $blocknum);
    #}

    if(!defined($blocknum)) {
	$blocknum = 1;
	# search for an empty slot, or extend the array
	$blocknum++ while defined($offsets->[$blocknum]);
	#&logf("Allocating %d bytes, assigning blkid %d", $bytes, $blocknum);
    }

    #$loglevel ++;

    my($wantwidth) = 5;
    # Minimum width, since that's how many low-order bits we steal for the tag
    $wantwidth ++ while $bytes > 1 << $wantwidth;

    my($blkaddr, $blkwidth, $blkoffset);

    if(exists($offsets->[$blocknum]) && $offsets->[$blocknum]) {
	$blkaddr = $offsets->[$blocknum];
	$blkwidth = $blkaddr & 0x1F;
	$blkoffset = $blkaddr & ~0x1F;
	if ($blkwidth == $wantwidth) {
	    #&logf("Block is already width %d, no change", $wantwidth);
	    #$loglevel --;
	    # The block is currently of the desired size. Leave it alone.
	    return $blocknum;
	} else {
	    #&logf("Freeing wrong-sized block");
	    #$loglevel ++;
	    # Free the current block, allocate a new one.
	    $self->_free($blkoffset, $blkwidth);
	    delete $offsets->[$blocknum];
	    #$loglevel --;
	}
    }

    # Allocate a block, update the offsets table, and return the new offset
    $blkoffset = $self->_alloc($wantwidth);
    $blkaddr = $blkoffset | $wantwidth;
    $offsets->[$blocknum] = $blkaddr;
    #$loglevel --;
    $blocknum;
}

sub free {
    my($self, $blknum) = @_;
    my($blkaddr) = $self->{'offsets'}->[$blknum];

    #&logf("Freeing block index %d", $blknum);
    #$loglevel ++;

    if($blkaddr) {
	my($blkoffset, $blkwidth);
	$blkwidth = $blkaddr & 0x1F;
	$blkoffset = $blkaddr & ~0x1F;
	$self->_free($blkoffset, $blkwidth);
    }

    delete $self->{'offsets'}->[$blknum];
    #$loglevel --;
    undef;
}

=head1 ATTRIBUTES

=head2 $allocator->{toc}

C<toc> holds a hashref whose keys are short strings and whose values
are integers. This table of contents is read and written as part of the
allocator's metadata but is not otherwise used by the allocator;
users of the allocator use it to find their data within the file.

=head2 $allocator->{fh}

The file handle passed in to C<open> or C<new>. If you find yourself needing
to use this, you should probably try to extend the class so that you don't.

=cut

# Used by ...::Block to get a positioned file handle.
sub _sought {
    my($self, $offset) = @_;

    my($fh) = $self->{fh};
    $fh->seek($offset + $self->{fudge}, 0)
	or croak;
    $fh;
}

package Mac::Finder::DSStore::BuddyAllocator::Block;

=head1 BuddyAllocator::Block

C<BuddyAllocator::Block> instances are returned by the
C<blockByNumber> and C<getBlock> methods. They hold a pointer into
the file and provide a handful of useful methods.

(There are also two other classes, C<WriteBlock> and C<StringBlock>,
which might be returned instead. Think of this as an interface rather
than as a concrete class.)

=head2 $block->read(length, [format])

Reads C<length> bytes from the block (advancing the read pointer
correspondingly). If C<format> is specified, the bytes read are
unpacked using the format; otherwise a byte string is returned. 

=head2 $block->length( )

Returns the length (or size) of this block.

=head2 $block->seek(position[, whence])

Adjusts the read/write pointer within the block.

=head2 $block->write(bytes)

=head2 $block->write(format, items...)

Writes data to the underlying file, at the position represented by this
block. If multiple arguments are given, the first is a format string
and the rest are the remaining arguments to C<pack>.

=head2 $block->close([ zerofill ])

This is generally a no-op, but if called on a writable block with
C<zerofill = true>, then zeroes will be written from the current
location to the end of the allocated block.

=head2 $block->copyback( )

Returns the block's contents as a string. For write blocks, this
reads from the file. This is just here for debugging purposes and
might change.

=cut

use strict;
use warnings;
use Carp;

#
# Block objects are created by the buddy allocator; they're a
# reference to an array with the following components:
#
#  [ $allocator, $value, $position]
#

sub new {
    my($class, $allocator, $offset, $size) = @_;

    my($value);
    $allocator->_sought($offset)->read($value, $size)
	> 0 or die;
    # Previously, this died if we couldn't read the full block.
    # Not sure if it's really an error not to read the full
    # block if the next layer up doesn't need the full block.
    # So now we're succeeding as long as we get something; if
    # the reader overruns it'll die in substr().

    bless([ $allocator, $value, 0 ], ref $class || $class);
}

sub read {
    my($self, $len, $unpack) = @_;

    my($pos) = $self->[2];
    die "out of range: pos=$pos len=$len max=".(length($self->[1])) if $pos + $len > length($self->[1]);
    my($bytes) = substr($self->[1], $pos, $len);
    $self->[2] = $pos + $len;
    
    $unpack? unpack($unpack, $bytes) : $bytes;
}

sub length {
    return CORE::length($_[0]->[1]);
}

sub close {
    1;
}

sub seek {
    my($self, $pos, $whence) = @_;
    $whence = 0 unless defined $whence;
    if ($whence == 0) {
	# pos = pos
    } elsif ($whence == 1) {
	$pos += $self->[2];
    } elsif ($whence == 2) {
	$pos += $self->length();
    } else {
	croak "seek: whence=$whence";
    }
    $self->[2] = $pos;
}

sub copyback {
    return $_[0]->[1];
}

package Mac::Finder::DSStore::BuddyAllocator::WriteBlock;

use strict;
use warnings;
use Carp;

#
# Write blocks
#

sub new {
    my($class, $allocator, $offset, $size) = @_;

    croak "Missing arguments"
	unless defined($offset) && defined($size);
    croak "Bad offset"
	if $offset <= 0;

    bless([ $allocator, undef, 0, $offset, $size ], ref $class || $class);
}

sub read {
    my($self) = @_;

    croak "This is a write-only block";
}

sub length {
    return ($_[0]->[4]);
}

sub seek {
    my($self, $pos, $whence) = @_;
    if ($whence == 0) {
	$self->[2] = $pos;
    } elsif ($whence == 1) {
	$self->[2] += $pos;
    } elsif ($whence == 2) {
	$self->[2] = $self->length + $pos;
    } else {
	croak "seek: whence=$whence";
    }
    undef $self->[1];
    $self;
}

sub write {
    my($self, $what, @args) = @_;;

    if (!defined($self->[1])) {
	$self->[1] = $self->[0]->_sought($self->[2] + $self->[3]);
    }

    if (@args) {
	$what = pack($what, @args);
    }

    my($wlen) = CORE::length($what);

    croak "Writing past end of block (writing $wlen at ".($self->[2]).", end is at ".($self->[4])."), died"
        if $self->[2]+$wlen > $self->[4];

    $self->[1]->write($what);
    $self->[2] += $wlen;
}

sub close {
    my($self, $fill) = @_;
    if (defined($fill) && $fill && $self->[2] < $self->[4]) {
        $self->write("\0" x ($self->[4] - $self->[2]));
    }
    undef $self->[1];
    1;
}

#
# This is just here for debugging/testing purposes
#

sub copyback {
    my($self) = @_;

    my($r) = Mac::Finder::DSStore::BuddyAllocator::Block->new(@{$self}[0, 3, 2]);

    undef $self->[1]; # probably need to re-seek now

    return $r;
}

package Mac::Finder::DSStore::BuddyAllocator::StringBlock;

use strict;
use warnings;

#
# This one's kind of handy, really, but is only used for debugging and
# test harnesses right now.
#

sub new {
    my($x) = '';
    bless(\$x, ref $_[0] || $_[0]);
}

sub write {
    my($self, $what, @args) = @_;;

    if (@args) {
	$what = pack($what, @args);
    }

    ${$self} .= $what;
}

sub copyback {
    ${$_[0]};
}

=head1 AUTHOR

Written by Wim Lewis as part of the Mac::Finder::DSStore package.

This file is copyright 2008 by Wim Lewis.
All rights reserved.
This program is free software; you can redistribute it and/or
modify it under the same terms as Perl itself.


=cut

1;
