declare module "utif" {
  export type TiffImageDirectory = {
    data?: Uint8Array;
    height?: number;
    width?: number;
    [key: string]: unknown;
  };

  const UTIF: {
    decode(buffer: ArrayBuffer): TiffImageDirectory[];
    decodeImage(buffer: ArrayBuffer, ifd: TiffImageDirectory): void;
    toRGBA8(ifd: TiffImageDirectory): Uint8Array;
  };

  export default UTIF;
}
