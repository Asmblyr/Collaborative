const packages = [
  ["comments", "plugin-comments"],
  ["google", "plugin-google-workspace"],
  ["color", "plugin-color"],
  ["calculator", "plugin-calculator"],
  ["overview", "plugin-overview"],
];

async function renamePackages(knex, fromScope, toScope) {
  await knex.transaction(async (transaction) => {
    await transaction.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [
      "asmblyr:plugin-collections",
    ]);
    const names = packages.flatMap(([, name]) => [
      `${fromScope}/${name}`,
      `${toScope}/${name}`,
    ]);
    const owners = await transaction("asmblyr_plugins")
      .withSchema("public")
      .whereIn("package_name", names)
      .select("namespace", "package_name")
      .forUpdate();

    // Validate the complete mapping before updating any installed owner.
    for (const [namespace, name] of packages) {
      const previous = owners.find(
        (owner) => owner.package_name === `${fromScope}/${name}`,
      );
      const next = owners.find(
        (owner) => owner.package_name === `${toScope}/${name}`,
      );
      if (
        (previous && previous.namespace !== namespace) ||
        (next && next.namespace !== namespace) ||
        (previous && next)
      ) {
        throw new Error(
          `Cannot rename plugin ${name}: conflicting namespace or package owner`,
        );
      }
    }

    for (const [namespace, name] of packages) {
      await transaction("asmblyr_plugins")
        .withSchema("public")
        .where({ namespace, package_name: `${fromScope}/${name}` })
        .update({ package_name: `${toScope}/${name}` });
    }
  });
}

exports.up = (knex) =>
  renamePackages(knex, "@asmblyr", "@asmblyr-collaborative");
exports.down = (knex) =>
  renamePackages(knex, "@asmblyr-collaborative", "@asmblyr");
