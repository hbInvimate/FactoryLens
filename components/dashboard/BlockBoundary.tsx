"use client";
// One block failing (Neon waking up, a timeout) does not take the page down: it shows Retry in place.
import { catchError, type ErrorInfo } from "next/error";

function BlockError(props: { title: string }, { retry }: ErrorInfo) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 py-6" data-testid="block-error">
      <p className="text-[15px] text-[#4b5563]">Could not load {props.title.toLowerCase()}. The database did not answer.</p>
      <button
        type="button"
        onClick={() => retry()}
        className="min-h-[56px] rounded-lg bg-[#1f5fcf] px-6 text-[16px] font-semibold text-white hover:brightness-110"
      >
        Retry
      </button>
    </div>
  );
}

export const BlockBoundary = catchError(BlockError);
