import path from "node:path";

/** @internal Local source loading must not treat installed dependencies as workspace sources. */
export function isLocalPluginPackage(
  projectDirectory: string,
  packageDirectory: string,
): boolean {
  const relative = path.relative(projectDirectory, packageDirectory);
  return (
    relative !== "" &&
    !path.isAbsolute(relative) &&
    relative
      .split(path.sep)
      .every((part) => part !== "node_modules" && !part.startsWith("."))
  );
}
