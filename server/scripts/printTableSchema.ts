import * as schema from '../../shared/schema.js';

const messagesTable = (schema as any).messages;
if (messagesTable) {
  console.log('COLUMNS:', Object.keys(messagesTable).map(col => ({
    name: col,
    dataType: messagesTable[col]?.dataType,
    isNullable: messagesTable[col]?.isNullable,
    hasDefault: messagesTable[col]?.hasDefault,
  })));
} else {
  console.log('Messages table not found!');
}
process.exit(0);
