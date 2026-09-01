import { BleManager } from '@sfourdrinier/react-native-ble-plx'

declare module '@sfourdrinier/react-native-ble-plx' {
  export class BleManager {
    onDeviceDiscover(listener: (event: any, device: any) => void): void
    startDeviceScan(
      filters: any,
      options: { allowDuplicates: boolean },
      callback: (error: any) => void,
    ): void
    stopDeviceScan(): void
    removeListener(event: string, listener: () => void): void
    connectToDevice(deviceId: string, options: { autoConnect: boolean }): Promise<any>
    cancelDeviceConnection(deviceId: string): Promise<void>
    monitorCharacteristicForDevice(
      deviceId: string,
      serviceId: string,
      characteristicId: string,
      callback: (error: any, characteristic: any) => void,
    ): void
    writeCharacteristicWithoutResponseForDevice(
      deviceId: string,
      characteristicId: string,
      value: BufferSource,
    ): Promise<void>
  }
}