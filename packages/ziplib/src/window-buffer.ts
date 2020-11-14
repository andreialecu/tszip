import { FileReader } from "./file-reader";

export class FileWindowBuffer {
  position = 0;
  buffer = Buffer.alloc(0);
  fsOp: FileReader | null = null;

  constructor(private fd: number) {}

  readSync(pos: number, length: number) {
    if (this.buffer.length < length) {
      this.buffer = Buffer.alloc(length);
    }
    this.position = pos;
    this.fsOp = new FileReader(
      this.fd,
      this.buffer,
      0,
      length,
      this.position
    ).readSync();
    return this;
  }

  expandLeftSync(length: number) {
    this.buffer = Buffer.concat([Buffer.alloc(length), this.buffer]);
    this.position -= length;
    if (this.position < 0) {
      this.position = 0;
    }
    this.fsOp = new FileReader(
      this.fd,
      this.buffer,
      0,
      length,
      this.position
    ).readSync();
    return this;
  }
}
