/** An expected client error. Unexpected failures should use ordinary Error. */
export class EndpointError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 499) {
      throw new RangeError("EndpointError requires a status between 400 and 499");
    }
    this.name = "EndpointError";
  }
}
