#!/usr/bin/perl -w

use Mac::Finder::DSStore qw( writeDSDBEntries makeEntries );
use Mac::Memory qw( );
use Mac::Files qw( NewAliasMinimal );
use Encode ();

my($backgroundWidth, $backgroundHeight);

if (defined($ENV{'backgroundFilename'}) && !defined($ENV{'windowWidth'}) && !defined($ENV{'windowHeight'})) {
  $ENV{'backgroundFilename'} = Encode::decode("UTF-8", $ENV{'backgroundFilename'});
  open(SIPS, "sips -g pixelHeight -g pixelWidth -g format '$ENV{'volumePath'}/.background/$ENV{'backgroundFilename'}' |") || die;
  while(<SIPS>) {
      if (/\bpixelWidth: (\d+)/) {
          $backgroundWidth = $1;
      }
      elsif (/\bpixelHeight: (\d+)/) {
          $backgroundHeight = $1;
      }
  }
  ( close(SIPS) &&
    defined($backgroundWidth) &&
    defined($backgroundHeight) )|| die "Cannot query image dimensions";
}

# perl DOESN'T DECODE incoming env variables properly, so, you MUST explicitly decode it using Encode::decode("UTF-8", ...)
# see http://stackoverflow.com/questions/2437877/how-can-i-properly-use-environment-variables-encoded-as-windows-1251-in-perl

if (defined($ENV{'volumeIcon'})) {
  # kIsInvisible
  &syscall_setfinderinfo(Encode::decode("UTF-8", $ENV{'volumeIcon'}), 'icns', "\0\0\0\0",  0x4000);
  # kHasCustomIcon
  &syscall_setfinderinfo("$ENV{'volumePath'}/.", "\0\0\0\0", "\0\0\0\0", 0x0400);
}

&writeDSDBEntries("$ENV{'volumePath'}/.DS_Store",
    &makeEntries(".background", Iloc_xy => [ 560, 170 ]),
    &makeEntries(".DS_Store", Iloc_xy => [ 610, 170 ]),
    &makeEntries(".fseventsd", Iloc_xy => [ 660, 170 ]),
    &makeEntries(".Trashes", Iloc_xy => [ 710, 170 ]),
    &makeEntries(".",
        (defined($ENV{'backgroundColor'}) ? BKGD_color : BKGD_alias) => (defined($ENV{'backgroundColor'}) ? "$ENV{'backgroundColor'}" : NewAliasMinimal("$ENV{'volumePath'}/.background/$ENV{'backgroundFilename'}")),
        ICVO => 1,
        fwi0_flds => [ $ENV{'windowY'}, $ENV{'windowX'}, $ENV{'windowY'} + (defined($ENV{'windowHeight'}) ? $ENV{'windowHeight'} : $backgroundHeight), $ENV{'windowX'} + (defined($ENV{'windowWidth'}) ? $ENV{'windowWidth'} : $backgroundWidth), "icnv", 0, 0 ],
        icvo => pack('A4 n A4 A4 n*', "icv4", $ENV{'iconSize'}, "none", "botm", 0, 0, 0, 0, 0, 1, 0, 100, 1),
        icvt => $ENV{'iconTextSize'}
    ),
    $ENTRIES
);

sub syscall_setfinderinfo {
  use constant { SYS_setattrlist => 221 };

  my($path, $type, $creator, $finderFlags) = @_;

  # This is just a special case of setattrlist(). The syscall takes a buffer
  # in the same format as returned by getattrlist, above, except without the initial length word.

  my($bits) = pack('SSLLLLL',
                   5,       # bitmapcount
                   0,       # reserved/padding
                   0x4000,  # ATTR_CMN_FNDRINFO
                   0, 0, 0, 0);
  my($data) = pack('a4a4nnnn n8',
                  $type, $creator,
                  $finderFlags,
                  0, 0, 0,
                  0, 0, 0, 0, 0, 0, 0, 0);
  my($r) = syscall(SYS_setattrlist, $path, $bits, $data, length($data), 0);
  die "setattrlist($path): $!\n"
      if $r == -1;
}