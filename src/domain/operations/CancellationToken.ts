export class CancellationError extends Error {
  constructor(message: string = 'Operation was cancelled') {
    super(message);
    this.name = 'CancellationError';
  }
}

export class CancellationToken {
  private _isCancelled = false;
  private _nativeCancelFn?: () => Promise<boolean>;

  constructor(nativeCancelFn?: () => Promise<boolean>) {
    this._nativeCancelFn = nativeCancelFn;
  }

  get isCancelled(): boolean {
    return this._isCancelled;
  }

  /**
   * Request cancellation. Calls native cancel function if provided.
   * Returns true if cancellation was accepted.
   */
  async cancel(): Promise<boolean> {
    if (this._isCancelled) {
      return true;
    }

    this._isCancelled = true;

    if (this._nativeCancelFn) {
      try {
        return await this._nativeCancelFn();
      } catch {
        // Native cancel failed but we still mark as cancelled
        return true;
      }
    }

    return true;
  }

  /**
   * Throw CancellationError if this token has been cancelled.
   * Use as a checkpoint in multi-step operations.
   */
  throwIfCancelled(): void {
    if (this._isCancelled) {
      throw new CancellationError();
    }
  }
}
