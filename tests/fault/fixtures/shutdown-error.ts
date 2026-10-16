// Fault injection into the real shutdown coordinator; never part of an application build.
import { installShutdown, logger } from "@wms/runtime";
const log = logger("worker");
const handle = setInterval(() => {}, 1000);
installShutdown(async () => {
  clearInterval(handle);
  throw new Error("synthetic-" + "private-shutdown-detail");
}, log);
log.info("started");
