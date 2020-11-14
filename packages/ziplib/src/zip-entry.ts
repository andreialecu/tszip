import { ZipConstants } from "./constants";

export class ZipEntry {
  /** Full relative path */
  name!: string;

  /** Version made by */
  verMade!: number;

  /** Version needed to extract */
  version!: number;

  /** Encrypt, decrypt flags */
  flags!: number;

  /** Compression method */
  method!: number;

  /** Modification time */
  time!: number;

  /** Uncompressed file crc-32 value */
  crc!: number;

  /** Compressed size */
  compressedSize!: number | bigint;

  /** Uncompressed size */
  size!: number | bigint;

  /** Filename length */
  fnameLen!: number;

  /** Extra field length */
  extraLen!: number;

  /** File comment length */
  comLen!: number;

  /** Volume number start */
  diskStart!: number;

  /** Internal file attributes */
  inattr!: number;

  /** External file attributes */
  attr!: number;

  /** LOC header offset */
  offset!: number | bigint;

  isDirectory!: boolean;
  comment!: string | null;

  headerOffset?: number;

  readHeader(data: Buffer, offset: number) {
    // data should be 46 bytes and start with "PK 01 02"
    if (
      data.length < offset + ZipConstants.CENHDR ||
      data.readUInt32LE(offset) != ZipConstants.CENSIG
    ) {
      throw new Error("Invalid entry header");
    }

    this.verMade = data.readUInt16LE(offset + ZipConstants.CENVEM);
    this.version = data.readUInt16LE(offset + ZipConstants.CENVER);
    this.flags = data.readUInt16LE(offset + ZipConstants.CENFLG);
    this.method = data.readUInt16LE(offset + ZipConstants.CENHOW);
    // modification time (2 bytes time, 2 bytes date)
    var timebytes = data.readUInt16LE(offset + ZipConstants.CENTIM);
    var datebytes = data.readUInt16LE(offset + ZipConstants.CENTIM + 2);
    this.time = parseZipTime(timebytes, datebytes);

    this.crc = data.readUInt32LE(offset + ZipConstants.CENCRC);
    this.compressedSize = data.readUInt32LE(offset + ZipConstants.CENSIZ);
    this.size = data.readUInt32LE(offset + ZipConstants.CENLEN);
    this.fnameLen = data.readUInt16LE(offset + ZipConstants.CENNAM);
    this.extraLen = data.readUInt16LE(offset + ZipConstants.CENEXT);
    this.comLen = data.readUInt16LE(offset + ZipConstants.CENCOM);
    this.diskStart = data.readUInt16LE(offset + ZipConstants.CENDSK);
    this.inattr = data.readUInt16LE(offset + ZipConstants.CENATT);
    this.attr = data.readUInt32LE(offset + ZipConstants.CENATX);
    this.offset = data.readUInt32LE(offset + ZipConstants.CENOFF);
  }

  readDataHeader(data: Buffer) {
    // 30 bytes and should start with "PK\003\004"
    if (data.readUInt32LE(0) != ZipConstants.LOCSIG) {
      throw new Error("Invalid local header");
    }
    this.version = data.readUInt16LE(ZipConstants.LOCVER);
    this.flags = data.readUInt16LE(ZipConstants.LOCFLG);
    this.method = data.readUInt16LE(ZipConstants.LOCHOW);
    var timebytes = data.readUInt16LE(ZipConstants.LOCTIM);
    var datebytes = data.readUInt16LE(ZipConstants.LOCTIM + 2);
    this.time = parseZipTime(timebytes, datebytes);

    this.crc = data.readUInt32LE(ZipConstants.LOCCRC) || this.crc;
    var compressedSize = data.readUInt32LE(ZipConstants.LOCSIZ);
    if (compressedSize && compressedSize !== ZipConstants.EF_ZIP64_OR_32) {
      this.compressedSize = compressedSize;
    }
    var size = data.readUInt32LE(ZipConstants.LOCLEN);
    if (size && size !== ZipConstants.EF_ZIP64_OR_32) {
      this.size = size;
    }
    this.fnameLen = data.readUInt16LE(ZipConstants.LOCNAM);
    this.extraLen = data.readUInt16LE(ZipConstants.LOCEXT);
  }

  read(data: Buffer, offset: number) {
    this.name = data.slice(offset, (offset += this.fnameLen)).toString();
    var lastChar = data[offset - 1];
    this.isDirectory = lastChar == 47 || lastChar == 92;

    if (this.extraLen) {
      this.readExtra(data, offset);
      offset += this.extraLen;
    }
    this.comment = this.comLen
      ? data.slice(offset, offset + this.comLen).toString()
      : null;
  }

  validateName() {
    if (/\\|^\w+:|^\/|(^|\/)\.\.(\/|$)/.test(this.name)) {
      throw new Error("Malicious entry: " + this.name);
    }
  }

  readExtra(data: Buffer, offset: number) {
    var signature,
      size,
      maxPos = offset + this.extraLen;
    while (offset < maxPos) {
      signature = data.readUInt16LE(offset);
      offset += 2;
      size = data.readUInt16LE(offset);
      offset += 2;
      if (ZipConstants.ID_ZIP64 === signature) {
        this.parseZip64Extra(data, offset, size);
      }
      offset += size;
    }
  }

  parseZip64Extra(data: Buffer, offset: number, length: number) {
    if (length >= 8 && this.size === ZipConstants.EF_ZIP64_OR_32) {
      this.size = data.readBigUInt64LE(offset);
      offset += 8;
      length -= 8;
    }
    if (length >= 8 && this.compressedSize === ZipConstants.EF_ZIP64_OR_32) {
      this.compressedSize = data.readBigUInt64LE(offset);
      offset += 8;
      length -= 8;
    }
    if (length >= 8 && this.offset === ZipConstants.EF_ZIP64_OR_32) {
      this.offset = data.readBigUInt64LE(offset);
      offset += 8;
      length -= 8;
    }
    if (length >= 4 && this.diskStart === ZipConstants.EF_ZIP64_OR_16) {
      this.diskStart = data.readUInt32LE(offset);
      // offset += 4; length -= 4;
    }
  }

  get encrypted() {
    return (
      (this.flags & ZipConstants.FLG_ENTRY_ENC) == ZipConstants.FLG_ENTRY_ENC
    );
  }

  get isFile() {
    return !this.isDirectory;
  }
}

function toBits(dec: number, size: number) {
  var b = (dec >>> 0).toString(2).padStart(size, "0");
  return b.split("");
}

function parseZipTime(timebytes: number, datebytes: number) {
  var timebits = toBits(timebytes, 16);
  var datebits = toBits(datebytes, 16);

  var mt = {
    h: parseInt(timebits.slice(0, 5).join(""), 2),
    m: parseInt(timebits.slice(5, 11).join(""), 2),
    s: parseInt(timebits.slice(11, 16).join(""), 2) * 2,
    Y: parseInt(datebits.slice(0, 7).join(""), 2) + 1980,
    M: parseInt(datebits.slice(7, 11).join(""), 2),
    D: parseInt(datebits.slice(11, 16).join(""), 2),
  };

  return Date.UTC(mt.Y, mt.M - 1, mt.D, mt.h, mt.m, mt.s);
}
