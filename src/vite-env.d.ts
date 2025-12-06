export {}

declare global {
  interface Window {
    ipcRenderer: {
      on(...args: any[]): any
      off(...args: any[]): any
      send(...args: any[]): any
      invoke(...args: any[]): Promise<any>
    }
  }
}
