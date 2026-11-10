---
"app-builder-lib": major
---

feat(publish)!: the GitHub/GitLab release body now resolves from the root `releaseInfo` with the rules of `latest*.yml` (`release-notes.md` in the build resources; an explicit `releaseNotesFile` in the build resources, then the project directory). A project-root `release-notes.md` is no longer read (warns once) and a missing `releaseInfo.releaseNotesFile` fails the build. See https://www.electron.build/docs/migration/v27-build-changes#github-gitlab-release-body-follows-latestyml
