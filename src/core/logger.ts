/**
 * 可注入的日志端口。
 *
 * 默认是 no-op：生产环境什么都不输出，也不引入任何日志库。
 * 开发环境注入一个真的 logger，出问题就有线索可查。
 *
 * 之前这个项目里「0 条日志、0 处错误上报」，任何异常都变成玄学 bug，
 * 排查只能靠加日志重跑一遍。
 */

/** 日志端口 */
export interface Logger {
  debug(message: string, data?: unknown): void
  warn(message: string, data?: unknown): void
  error(message: string, data?: unknown): void
}

/** 什么都不做的 logger（默认，生产环境用这个） */
export const noopLogger: Logger = {
  debug() {},
  warn() {},
  error() {},
}

/** 把日志打到 console 上（开发环境用） */
export function consoleLogger(): Logger {
  return {
    debug(message: string, data?: unknown): void {
      console.debug(`[markup] ${message}`, data ?? '')
    },
    warn(message: string, data?: unknown): void {
      console.warn(`[markup] ${message}`, data ?? '')
    },
    error(message: string, data?: unknown): void {
      console.error(`[markup] ${message}`, data ?? '')
    },
  }
}
