import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as api from "../lib/api";
import { errorMessage } from "../lib/api";
import Button from "./Button";
import Spinner from "./Spinner";
import { IconAlertTriangle } from "./icons";

// Two full confirmation steps, each restating exactly what will and won't
// be deleted, before anything actually happens - a destructive, irreversible
// action gets no "are you sure? [OK]" shortcut here.
export default function ClearHistoryModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);

  const previewQuery = useQuery({ queryKey: ["clear-history-preview"], queryFn: api.previewClearHistory });

  const clearMutation = useMutation({
    mutationFn: api.clearHistory,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["stats"] }),
        queryClient.invalidateQueries({ queryKey: ["runs"] }),
      ]);
      onClose();
    },
  });

  const jobCount = previewQuery.data?.clearable ?? 0;
  const runCount = previewQuery.data?.runs ?? 0;
  const hasNothingToClear = jobCount === 0 && runCount === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-[420px] rounded-2xl bg-surface border border-line shadow-[0_24px_60px_-16px_rgba(0,0,0,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        {previewQuery.isLoading ? (
          <div className="p-10">
            <Spinner />
          </div>
        ) : step === 1 ? (
          <>
            <div className="p-6">
              <div className="flex items-center gap-2.5">
                <IconAlertTriangle className="text-[17px] text-bad shrink-0" />
                <h2 className="font-display text-base font-semibold text-text">Clear scan history?</h2>
              </div>

              <p className="text-sm text-muted mt-3.5 leading-relaxed">
                This removes{" "}
                <span className="text-text font-medium">
                  {jobCount} job{jobCount === 1 ? "" : "s"}
                </span>{" "}
                the AI has found but you haven't applied to — everything marked{" "}
                <span className="text-text font-medium">New</span>,{" "}
                <span className="text-text font-medium">Shortlisted</span>, or{" "}
                <span className="text-text font-medium">Dismissed</span> — plus{" "}
                <span className="text-text font-medium">
                  {runCount} past run{runCount === 1 ? "" : "s"}
                </span>{" "}
                behind your Search activity chart and Analytics page. Your next run will rescan every
                board from scratch instead of skipping postings it's already shown you.
              </p>
              <p className="text-sm text-muted mt-3 leading-relaxed">
                Roles you've <span className="text-text font-medium">applied to</span>,{" "}
                <span className="text-text font-medium">interviewed for</span>, or gotten an{" "}
                <span className="text-text font-medium">offer</span> on are never touched.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line-soft">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => setStep(2)} disabled={hasNothingToClear}>
                Continue
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="p-6">
              <div className="flex items-center gap-2.5">
                <IconAlertTriangle className="text-[17px] text-bad shrink-0" />
                <h2 className="font-display text-base font-semibold text-bad">Are you sure?</h2>
              </div>

              <p className="text-sm text-muted mt-3.5 leading-relaxed">
                You're about to permanently delete{" "}
                <span className="text-text font-medium">
                  {jobCount} job{jobCount === 1 ? "" : "s"}
                </span>{" "}
                and{" "}
                <span className="text-text font-medium">
                  {runCount} run{runCount === 1 ? "" : "s"}
                </span>{" "}
                of history. There's no undo — if you want any of these jobs back, you'll need to wait for
                a future run to resurface them.
              </p>
              {clearMutation.isError && (
                <p className="text-sm text-bad mt-3">{errorMessage(clearMutation.error, "Could not clear history")}</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line-soft">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="danger-solid" loading={clearMutation.isPending} onClick={() => clearMutation.mutate()}>
                Yes, clear it
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
