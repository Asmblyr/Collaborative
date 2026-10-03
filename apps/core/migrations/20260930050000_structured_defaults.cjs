exports.up = async (knex) => {
  await knex.raw('ALTER TABLE public.asmblyr_field_metadata DROP CONSTRAINT asmblyr_field_default_value_check');
  // SQL NULL means no default; every non-null JSON value is validated by its field type in Core.
  await knex.raw(`ALTER TABLE public.asmblyr_field_metadata ADD CONSTRAINT asmblyr_field_default_value_check
    CHECK (default_value IS NULL OR jsonb_typeof(default_value) IN ('string', 'number', 'boolean', 'array', 'object'))`);
};

exports.down = async (knex) => {
  if (await knex('asmblyr_field_metadata').whereRaw("jsonb_typeof(default_value) IN ('array', 'object')").first()) {
    throw new Error('Cannot roll back while structured defaults exist');
  }
  await knex.raw('ALTER TABLE public.asmblyr_field_metadata DROP CONSTRAINT asmblyr_field_default_value_check');
  await knex.raw(`ALTER TABLE public.asmblyr_field_metadata ADD CONSTRAINT asmblyr_field_default_value_check
    CHECK (default_value IS NULL OR jsonb_typeof(default_value) IN ('string', 'number', 'boolean'))`);
};
