const func = ({packager, target, ...obj}) => console.log(obj)

export const artifactBuildStarted = func
export const artifactBuildCompleted = func
export const beforePack = func
export const afterExtract = func
export const afterPack = func