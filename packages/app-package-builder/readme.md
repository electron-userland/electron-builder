Idea is very simple — in the runtime we don't need to process or understand archive format. Wwe just need to know file data ranges. Where file data begins and where ends.

Builder is more complicated — builder should compute such data ranges.

In the first prototype ZIP was used (because format is very simple). But there are 2 drawbacks:

1. Size. Test app  37.853 vs 34.218 3MB for simple app and much more noticiable difference for big application (confirmed by some user app). Because https://sourceforge.net/p/sevenzip/discussion/45798/thread/222c71f9/
2. No way to ask 7za to write file modification timestamps for ZIP format. And so, checksum for the whole file always mismatch. 

Yes, we can remove timestamps, but... after first working prototype it was clear that task is not so complex. As stated above, runtime implementation is simple.
So, why not just port Java implementation of 7z format to TypeScript? 

## Package File

(size as in a windows explorer)

7z - 34.134 Compression time 26s

zip(lzma) - 37.612 Compression time 26s (~ the same time (as expected, because filters, as documented, are very fast ())

zip(xz) - 37.619  Not clear why. xz supports filters, but it seems 7z doesn't apply it correctly.

Onshape test app:

```
ZIP: 37.853
7za solid: ~32
7za not solid: 34.218
7za not solid and header compression disabled: 34.225
```