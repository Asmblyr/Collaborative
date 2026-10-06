/** Type-only descriptor. A brand distinguishes descriptors from ordinary row shapes. */
declare const descriptor: unique symbol;
export interface CollectionSchema<
  Read extends object,
  Create extends object,
  Update extends object,
  Delete extends boolean = true,
  ProfileCreate extends object = never,
> {
  readonly [descriptor]: true;
  readonly read: Read;
  readonly create: Create;
  readonly update: Update;
  readonly delete: Delete;
  readonly profileCreate: ProfileCreate;
}
export type Deletable<T> =
  T extends CollectionSchema<object, object, object, infer D, object>
    ? D
    : true;
export type ReadRow<T> =
  T extends CollectionSchema<infer R, object, object, boolean, object> ? R : T;
export type CreateRow<T> =
  T extends CollectionSchema<object, infer C, object, boolean, object>
    ? C
    : Partial<T>;
export type UpdateRow<T> =
  T extends CollectionSchema<object, object, infer U, boolean, object>
    ? U
    : Partial<T>;
export type ProfileCreateRow<T> = T extends { readonly profileCreate: infer P }
  ? P
  : CreateRow<T>;
export type CommitInput<T> =
  T extends CollectionSchema<object, object, object, boolean, object>
    ?
        | { id?: never; values: CreateRow<T> }
        | { id: string; values: UpdateRow<T> }
    : { id?: string; values: Partial<T> };
