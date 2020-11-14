import { ZipConstants } from "./constants";

export class CentralDirectoryHeader {
  volumeEntries: number = 0;
  totalEntries: number = 0;
  size: number = 0;
  offset: number = 0;
  commentLength: number = 0;
  headerOffset: number = 0;

  read(data: Buffer) {
    if (
      data.length != ZipConstants.ENDHDR ||
      data.readUInt32LE(0) != ZipConstants.ENDSIG
    ) {
      throw new Error("Invalid central directory");
    }

    // number of entries on this volume
    this.volumeEntries = data.readUInt16LE(ZipConstants.ENDSUB);
    // total number of entries
    this.totalEntries = data.readUInt16LE(ZipConstants.ENDTOT);
    // central directory size in bytes
    this.size = data.readUInt32LE(ZipConstants.ENDSIZ);
    // offset of first CEN header
    this.offset = data.readUInt32LE(ZipConstants.ENDOFF);
    // zip file comment length
    this.commentLength = data.readUInt16LE(ZipConstants.ENDCOM);
  }
}
