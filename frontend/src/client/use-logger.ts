import { useCallback } from "react";
import { logger } from "./logger";
import { AppError, type ErrorContext } from "../shared/app-error";
import type { ErrorCode } from "../shared/error-dictionary";

/** Hook：在组件中记录结构化日志 */
export function useLogger() {
  const logInfo = useCallback((message: string, context?: ErrorContext) => {
    logger.info(message, context);
  }, []);

  const logWarn = useCallback(
    (code: ErrorCode, message: string, context?: ErrorContext) => {
      logger.warn(code, message, context);
    },
    [],
  );

  const logError = useCallback((err: AppError) => {
    logger.error(err);
  }, []);

  const logAndThrow = useCallback(
    (code: ErrorCode, message: string, context?: ErrorContext) => {
      const err = new AppError(code, context);
      logger.error(err);
      throw err;
    },
    [],
  );

  return { logInfo, logWarn, logError, logAndThrow };
}
