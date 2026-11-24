/** Raised for invalid, unreadable or malformed coverage input. */
export class CoverageInputError extends Error {
    constructor(
        message: string,
        readonly source?: string,
    ) {
        super(source ? `${source}: ${message}` : message);
        this.name = 'CoverageInputError';
    }
}
