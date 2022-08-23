declare interface Reader {
  readByte(): number;
}

declare interface Writer {
  writeByte(byte: number);
}

declare module 'lzma-purejs' {
  function decompress(bytes: number[], reader: Reader, writer: Writer, length: number): void;
}
