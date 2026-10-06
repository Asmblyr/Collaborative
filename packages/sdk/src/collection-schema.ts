/** Type-only descriptor. A brand distinguishes descriptors from ordinary row shapes. */
declare const descriptor: unique symbol;
export interface CollectionSchema<
  Read extends object,
  Create extends object,
  Update extends object,
  Delete extends boolean = true,
> {
  readonly [descriptor]: true;
  readonly read: Read;
  readonly create: Create;
  readonly update: Update;
  readonly delete: Delete;
}
export type Deletable<T> =
  T extends CollectionSchema<object, object, object, infer D> ? D : true;
export type ReadRow<T> =
  T extends CollectionSchema<infer R, object, object, boolean> ? R : T;
export type CreateRow<T> =
  T extends CollectionSchema<object, infer C, object, boolean> ? C : Partial<T>;
export type UpdateRow<T> =
  T extends CollectionSchema<object, object, infer U, boolean> ? U : Partial<T>;
export type CommitInput<T> =
  T extends CollectionSchema<object, object, object, boolean>
    ?
        | { id?: never; values: CreateRow<T> }
        | { id: string; values: UpdateRow<T> }
    : { id?: string; values: Partial<T> };
