declare module 'qrcode' {
  type CanvasOptions = {
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
    margin?: number
    width?: number
  }

  const QRCode: {
    toCanvas(canvas: HTMLCanvasElement, text: string, options?: CanvasOptions): Promise<void>
  }

  export default QRCode
}