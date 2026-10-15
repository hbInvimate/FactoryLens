"use client";
// One block failing (Neon waking up, a timeout) does not take the page down: it shows Retry in place.
import { catchError, type ErrorInfo } from "next/error";
import { Button } from "../ds";

function BlockError(props: { title: string }, { retry }: ErrorInfo) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-6" data-testid="block-error">
      <p className="text-[15px] text-ink-2">Could not load {props.title.toLowerCase()}. The database did not answer.</p>
      <Button variant="primary" onClick={() => retry()}>
        Retry
      </Button>
    </div>
  );
}

export const BlockBoundary = catchError(BlockError);
