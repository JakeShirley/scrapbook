const dosEpoch = new Date("1980-01-01T00:00:00.000Z");

type ZipEntryInput = {
  data: Buffer;
  name: string;
};

type CentralDirectoryRecord = {
  crc32: number;
  dataLength: number;
  localHeaderOffset: number;
  name: Buffer;
};

const crc32Table = new Uint32Array(256);

for (let index = 0; index < crc32Table.length; index += 1) {
  let value = index;

  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }

  crc32Table[index] = value >>> 0;
}

const crc32 = (buffer: Buffer): number => {
  let value = 0xffffffff;

  for (const byte of buffer) {
    value = (crc32Table[(value ^ byte) & 0xff] ?? 0) ^ (value >>> 8);
  }

  return (value ^ 0xffffffff) >>> 0;
};

const toDosDateTime = (date = new Date()): { date: number; time: number } => {
  const value = date < dosEpoch ? dosEpoch : date;
  const year = Math.min(2107, Math.max(1980, value.getUTCFullYear()));

  return {
    date: ((year - 1980) << 9) | ((value.getUTCMonth() + 1) << 5) | value.getUTCDate(),
    time: (value.getUTCHours() << 11) | (value.getUTCMinutes() << 5) | (value.getUTCSeconds() >> 1),
  };
};

const createLocalFileHeader = (input: {
  crc32: number;
  dataLength: number;
  name: Buffer;
  modifiedAt: { date: number; time: number };
}): Buffer => {
  const header = Buffer.alloc(30);

  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(input.modifiedAt.time, 10);
  header.writeUInt16LE(input.modifiedAt.date, 12);
  header.writeUInt32LE(input.crc32, 14);
  header.writeUInt32LE(input.dataLength, 18);
  header.writeUInt32LE(input.dataLength, 22);
  header.writeUInt16LE(input.name.length, 26);
  header.writeUInt16LE(0, 28);

  return header;
};

const createCentralDirectoryHeader = (input: {
  crc32: number;
  dataLength: number;
  localHeaderOffset: number;
  name: Buffer;
  modifiedAt: { date: number; time: number };
}): Buffer => {
  const header = Buffer.alloc(46);

  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(input.modifiedAt.time, 12);
  header.writeUInt16LE(input.modifiedAt.date, 14);
  header.writeUInt32LE(input.crc32, 16);
  header.writeUInt32LE(input.dataLength, 20);
  header.writeUInt32LE(input.dataLength, 24);
  header.writeUInt16LE(input.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(input.localHeaderOffset, 42);

  return header;
};

const createEndOfCentralDirectory = (input: {
  centralDirectoryOffset: number;
  centralDirectorySize: number;
  entryCount: number;
}): Buffer => {
  const header = Buffer.alloc(22);

  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(input.entryCount, 8);
  header.writeUInt16LE(input.entryCount, 10);
  header.writeUInt32LE(input.centralDirectorySize, 12);
  header.writeUInt32LE(input.centralDirectoryOffset, 16);
  header.writeUInt16LE(0, 20);

  return header;
};

export const createStoredZip = (entries: ZipEntryInput[]): Buffer => {
  if (entries.length > 65535) {
    throw new Error("ZIP export supports up to 65535 entries");
  }

  const modifiedAt = toDosDateTime();
  const fileParts: Buffer[] = [];
  const centralRecords: CentralDirectoryRecord[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const entryCrc32 = crc32(entry.data);
    const localHeader = createLocalFileHeader({
      crc32: entryCrc32,
      dataLength: entry.data.length,
      modifiedAt,
      name,
    });

    fileParts.push(localHeader, name, entry.data);
    centralRecords.push({
      crc32: entryCrc32,
      dataLength: entry.data.length,
      localHeaderOffset: offset,
      name,
    });
    offset += localHeader.length + name.length + entry.data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectoryParts = centralRecords.flatMap((record) => [
    createCentralDirectoryHeader({ ...record, modifiedAt }),
    record.name,
  ]);
  const centralDirectorySize = centralDirectoryParts.reduce((size, part) => size + part.length, 0);

  return Buffer.concat([
    ...fileParts,
    ...centralDirectoryParts,
    createEndOfCentralDirectory({
      centralDirectoryOffset,
      centralDirectorySize,
      entryCount: entries.length,
    }),
  ]);
};
