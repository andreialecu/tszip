import { ZipConstants } from "./constants";
import fs from "fs";
import { FileWindowBuffer } from "./window-buffer";
import { CentralDirectoryHeader } from "./central-directory-header";
import { ZipEntry } from "./zip-entry";

function readUntilFound({
  win,
  lastPos,
  minPos,
  firstByte,
  sig,
  chunkSize = 1024,
}: {
  win: FileWindowBuffer;
  lastPos: number;
  minPos: number;
  firstByte: number;
  sig: number;
  chunkSize?: number;
}): { lastBytesRead: number; lastBufferPosition: number } {
  if (!win.fsOp?.lastBytesRead) {
    throw new Error("Archive read error");
  }

  const buffer = win.buffer;
  let pos = lastPos;
  let bufferPosition = pos - win.position;
  while (--pos >= minPos && --bufferPosition >= 0) {
    if (
      buffer.length - bufferPosition >= 4 &&
      buffer[bufferPosition] === firstByte
    ) {
      if (buffer.readUInt32LE(bufferPosition) === sig) {
        return {
          lastBufferPosition: bufferPosition,
          lastBytesRead: win.fsOp.lastBytesRead,
        };
      }
    }
  }

  if (pos <= minPos) {
    throw new Error("Bad archive");
  }

  let expandLength = Math.min(1024, pos - minPos);

  return readUntilFound({
    win: win.expandLeftSync(expandLength),
    firstByte,
    sig,
    minPos,
    lastPos: lastPos + 1,
    chunkSize: chunkSize * 2,
  });
}

export class CentralDirectory {
  comment?: string;
  entriesCount: number = 0;
  fd: number;
  fileSize: number;
  chunkSize: number;

  entries: Map<string, ZipEntry> = new Map();

  constructor(fileName: string, chunkSize?: number) {
    this.fd = fs.openSync(fileName, "r");
    const stat = fs.fstatSync(this.fd);
    this.fileSize = stat.size;

    this.chunkSize = chunkSize || Math.round(this.fileSize / 1000);
    chunkSize = Math.max(
      Math.min(this.chunkSize, Math.min(128 * 1024, this.fileSize)),
      Math.min(1024, this.fileSize)
    );

    this.readCentralDirectory();

    fs.closeSync(this.fd);
  }

  readEntries(header: CentralDirectoryHeader) {
    const win = new FileWindowBuffer(this.fd);
    win.readSync(
      header.offset,
      Math.min(this.chunkSize, this.fileSize - header.offset)
    );

    this.processEntries({
      win,
      pos: header.offset,
      entriesLeft: header.volumeEntries,
    });
  }

  processEntries({
    win,
    pos,
    entriesLeft,
  }: {
    win: FileWindowBuffer;
    pos: number;
    entriesLeft: number;
  }): void {
    if (!win.fsOp?.lastBytesRead) {
      throw new Error("Entries read error");
    }

    const buffer = win.buffer;
    let bufferPos = pos - win.position;
    const bufferLength = buffer.length;

    while (entriesLeft > 0) {
      const entry = new ZipEntry();
      entry.readHeader(buffer, bufferPos);
      entry.headerOffset = win.position + bufferPos;
      pos += ZipConstants.CENHDR;
      bufferPos += ZipConstants.CENHDR;

      const entryHeaderSize = entry.fnameLen + entry.extraLen + entry.comLen;
      const advanceBytes =
        entryHeaderSize + (entriesLeft > 1 ? ZipConstants.CENHDR : 0);
      if (bufferLength - bufferPos < advanceBytes) {
        // we'd overrun the buffer, read again
        pos -= ZipConstants.CENHDR;
        win.readSync(pos, this.chunkSize);
        return this.processEntries({ win, pos, entriesLeft });
      }

      entry.read(buffer, bufferPos);
      entry.validateName();

      this.entries.set(entry.name, entry);
      entriesLeft--;
      pos += entryHeaderSize;
      bufferPos += entryHeaderSize;
    }
  }

  readCentralDirectory() {
    const totalReadLength = Math.min(
      ZipConstants.ENDHDR + ZipConstants.MAXFILECOMMENT,
      this.fileSize
    );
    const chunkSize = Math.min(1024, this.chunkSize);

    const win = new FileWindowBuffer(this.fd);
    win.readSync(this.fileSize - chunkSize, chunkSize);
    const { lastBufferPosition } = readUntilFound({
      win,
      lastPos: this.fileSize,
      minPos: this.fileSize - totalReadLength,
      firstByte: ZipConstants.ENDSIGFIRST,
      sig: ZipConstants.ENDSIG,
    });

    const buffer = win.buffer;

    const centralDirectory = new CentralDirectoryHeader();
    centralDirectory.read(
      buffer.slice(lastBufferPosition, lastBufferPosition + ZipConstants.ENDHDR)
    );
    centralDirectory.headerOffset = win.position + lastBufferPosition;
    if (centralDirectory.commentLength) {
      this.comment = buffer
        .slice(
          lastBufferPosition + ZipConstants.ENDHDR,
          lastBufferPosition +
            ZipConstants.ENDHDR +
            centralDirectory.commentLength
        )
        .toString();
    }

    this.entriesCount = centralDirectory.volumeEntries;
    if (
      (centralDirectory.volumeEntries === ZipConstants.EF_ZIP64_OR_16 &&
        centralDirectory.totalEntries === ZipConstants.EF_ZIP64_OR_16) ||
      centralDirectory.size === ZipConstants.EF_ZIP64_OR_32 ||
      centralDirectory.offset === ZipConstants.EF_ZIP64_OR_32
    ) {
      // read 64
    } else {
      this.readEntries(centralDirectory);
    }
  }
}
