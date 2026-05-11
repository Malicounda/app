declare module 'xlsx' {
  // Minimal typings to satisfy TS when dynamically importing xlsx
  export interface WorkBook { SheetNames: string[]; Sheets: Record<string, any>; }
  export interface Utils {
    sheet_to_json: (ws: any, opts?: any) => any[];
  }
  export const utils: Utils;
  export function read(data: any, opts?: any): WorkBook;
}
