# Requirements: steady

Owner: Anish (built by Yadnesh while Anish is unavailable). App: `apps/steady`. Uses `@haunt-kit/ui` (lantern theme), `@haunt-kit/gestures` (rep detector) and `@haunt-kit/host-sdk` (motion, wake lock).

**User story:** As someone doing physical-therapy exercises at home, I want my phone to count my reps out loud and tell me if I'm going too fast or not far enough, and to give my therapist a report.

1. **Exercises:** shoulder raise and bicep curl, phone held in the hand (or an armband).
2. **Calibration:** hold the start position for 2 seconds. If the phone moves, it starts over.
3. **Live screen:** a big rep count, the current angle, and the target. Counts are spoken aloud. Speech, motion permission and the screen wake lock all start from the Start tap (an iPhone rule).
4. **Form feedback:** "Too fast" (under the minimum time per rep) and "Not full range" (target angle not reached), shown and spoken. Too fast comes first.
5. **History:** sessions are saved on the device only (IndexedDB). No account and no server. Damaged records are skipped, never crash the app.
6. **Therapist report:** date, exercise, reps, average range of motion, average time per rep, full-range and too-fast counts, each rep, and a note that Steady is not a medical device. Print or save as PDF.
7. **Accessibility:** VoiceOver-friendly (labelled meters, live feedback), large text (125%, 150%), a high-contrast theme (7:1 or better), and a voice-only mode that also speaks the instructions.
8. **First run:** a disclaimer: not a medical device, no medical advice, follow your therapist. Shown until accepted.
9. **No phone needed:** a demo person does the exercise, so judges can try it on a laptop.
10. **Never medical advice:** the words never diagnose or promise outcomes.

## Property tests

- the session summary always agrees with its reps (totals, averages, counts)
- history never loses a saved session, even after reopening the database
- whatever is in storage, settings load as valid settings
