/** 业务单号生成：租约号、账单号、工单号、房源编号 */

function pad(n: number, len = 3): string {
  return String(n).padStart(len, '0')
}

function yyyymm(date = new Date()): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1, 2)}`
}

/**
 * 租约号：HT202609001
 * @param seq 当月序号，调用方传入（查库取最大值 +1）
 */
export function makeLeaseNo(seq: number, date = new Date()): string {
  return `HT${yyyymm(date)}${pad(seq)}`
}

/** 账单号：ZD{租约号}-{期次}，如 ZDHT202609001-003 */
export function makeBillNo(leaseNo: string, periodIndex: number): string {
  return `ZD${leaseNo}-${pad(periodIndex)}`
}

/** 派工单号：BX202609001 */
export function makeWorkOrderNo(seq: number, date = new Date()): string {
  return `BX${yyyymm(date)}${pad(seq)}`
}

/** 厂房编号：CF-A01 形式，调用方传入序号 */
export function makeFactoryCode(seq: number): string {
  return `CF-${pad(seq, 3)}`
}

/**
 * 公寓房间编号：GY{楼栋序号}-{房号}
 * 房号本身已包含楼层信息（如 301 表示 3 楼 01 间），所以不再重复拼接楼层。
 */
export function makeApartmentCode(buildingSeq: number, roomNo: string): string {
  return `GY${buildingSeq}-${roomNo}`
}
