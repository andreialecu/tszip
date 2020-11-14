import fs from "fs";

export class FileReader {
  totalBytesRead = 0;
  lastBytesRead = 0;

  constructor(
    private fd: number,
    private buffer: Buffer,
    private offset: number,
    private length: number,
    private position: number
  ) {}

  readSync() {
    this.lastBytesRead = fs.readSync(
      this.fd,
      this.buffer,
      this.offset + this.totalBytesRead,
      this.length - this.totalBytesRead,
      this.position + this.totalBytesRead
    );
    this.totalBytesRead += this.lastBytesRead;
    return this;
  }
}
