// reuse to avoid stale data (maybe not removed correctly on test stop)
// use __dirname to allow run in parallel from different project clones
// on macOs use /tmp otherwise docker test fails
/*
docker: Error response from daemon: Mounts denied: o Docker.
      You can configure shared paths from Docker -> Preferences... -> File Sharing.
 */
export const ELECTRON_VERSION = "1.7.8"