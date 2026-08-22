// Structured logging — single-line JSON to stdout/stderr, which Vercel's log
// viewer (and any local terminal) already captures with no extra service.
// Deliberately no external dependency: a request-scoped `event` + flat
// `fields` object is enough to grep/debug a production run.

type Fields = Record<string, unknown>;

function emit(stream: "log" | "error", level: "info" | "error", event: string, fields?: Fields) {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields });
  console[stream](line);
}

export const log = {
  info(event: string, fields?: Fields) {
    emit("log", "info", event, fields);
  },
  error(event: string, fields?: Fields) {
    emit("error", "error", event, fields);
  },
};
