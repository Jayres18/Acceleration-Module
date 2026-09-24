# Module handoff — Acceleration (Newton's Second Law)

Answers to `MODULE_BUILD_HANDOFF.md` §0 and the §8 handoff form.

## §0 — the two questions

1. **Build tool and version:** Vite 8.0.12 (Node 24.7.0, three.js 0.184.0).
2. **Client-side routing / deep routes:** **No.** The module lives only at its own
   root, `/acceleration/`. Query parameters only (`?user_id=`, `?exam_id=`,
   `?mode=explore`, `?debug=1`), which a hard refresh resolves to the same
   `index.html`. **No nginx `location` block is needed.**

---

## Module handoff

- **Module slug:** `acceleration`
- **Zip filename:** `acceleration-dist-2026-08-12.zip`
- **BASE_PATH used at build:** `/acceleration/`
- **Build tool + version:** Vite 8.0.12
- **Build command:** `npm run build`

  `BASE_PATH` defaults to `/acceleration/` in `vite.config.js`, so a bare build is
  already deployable; a root build cannot be produced by accident. A malformed
  value throws rather than warning.

- **Client-side routing / deep routes?** **no**

- **API endpoints used:**
  - `GET /api/questions/exam/:exam_id`
  - `POST /api/scores/submit` — once per sitting
- **`LMS_ORIGIN` developed against:** `http://parallaxed.local:5000`
  (server-side only, read by Node in `vite.config.js`; never in the bundle)
- **Any absolute URLs in the bundle?** **no** — static check 2 is silent.
- **Anything expected at the web root?** **no** — everything is under
  `/acceleration/`, except the `/api` calls, which are root-relative by design.
- **External hosts the bundle fetches at runtime:** **none.**

  Static check 3 lists four hosts. All four are dead string constants inside
  minified three.js and are never requested:

  | Host | What it is |
  | --- | --- |
  | `cdn.jsdelivr.net` | `DEFAULT_HAND_PROFILE_PATH` in `XRHandMeshModel`. Overridden — the hand meshes are vendored at `hand-profiles/generic-hand/` and `XRHandler` assigns `handModel.path` before the `connected` event reads it. |
  | `immersiveweb.dev` | An `<a href>` in three.js's `VRButton`, shown only if WebXR is unsupported. |
  | `jcgt.org` | A paper citation in a three.js shader comment. |
  | `www.w3.org` | XML namespace URIs. |

### Verification (§7)

- **Static checks passed: yes** — all four, against a preview of the build.
  1. Entry URLs: `/acceleration/assets/index-CqRU3AR2.js`, `/acceleration/assets/index-DLXYYcxZ.css`
  2. No absolute IP / localhost / port URL anywhere in `dist/` — **silent**
  3. Four hosts, all justified above
  4. All of `public/` present — 27 files: `audio/` (18), `models/rocket/` (3), `hand-profiles/generic-hand/` (2), plus entry JS/CSS and `index.html`

- **Runtime checks passed on desktop: partial.** What was confirmed against
  `npm run preview`:
  - All 27 asset paths return **200** under `/acceleration/` — no 404s.
  - `/api` is proxied under `preview` as well as `dev`; `GET /api/questions/exam/42`
    returns 200 through the preview server.
  - 21/21 unit tests pass (`npm test`) covering `examLink` — including the
    storage-disabled and `replaceState`-throwing paths — and the defensive exam
    property parsing, pinned against the two live payloads below.

  **Not yet done, and needing a person:** the interactive checklist items — a
  full sitting, the backend-stopped retry cycle, reload-mid-exam, explore
  re-entry, double-tap on submit. These were **deliberately not run**: the
  submit endpoint records a `(student_id, exam_id)` pair permanently and rejects
  the second attempt, so a test sitting burns that pair against the live
  classroom database. Needs a throwaway student id, from someone who owns that
  data.

- **Tested on real headset: no.**
  - Device / browser: —
  - Full exam sitting confirmed saved: **no**

- **Checks skipped, and why:** the headset section in full, and the interactive
  desktop items above. No headset was available in this session, and the live
  submissions need an expendable student id. The guide is explicit that a
  desktop pass proves little here — loopback secure-context and silent
  mixed-content blocking are exactly what a desktop cannot exercise.

### Known issues

1. **Exam 41 has three questions with empty `question_properties_values`.**
   Nothing in `{}` is gradeable by this module. A question with no usable target
   is now recorded **incorrect** and logged, rather than passing everyone —
   `[].every()` is `true`, so the previous reading awarded a mark to anyone who
   launched at all. **Exam 41 is not this module's exam** (confirmed
   2026-09-22), so nothing needs setting there — it is recorded here only
   because it is what the endpoint returns for a neighbouring id. **Exam 42**
   is this module's exam and the correctly configured one (`target_avg_accel`,
   `target_max_velocity`, `target_peak_altitude`, all as strings).

2. **A first attempt is a student's only scored attempt.** `recordResult` is
   idempotent per `question_id`, so a student who fails, resets and succeeds
   keeps the failed mark. This is pre-existing behaviour and it is deliberate
   as an anti-double-scoring measure, but it is a grading decision worth
   confirming — retrying is otherwise freely available via the RESET button.

3. **A failed question load drops silently to free play.** If
   `GET /api/questions/exam/:id` fails, the module continues without an exam and
   nothing is ever submitted. The student sees a working simulation and no
   error. Save *failures* are now reported on the results panel; load failures
   are not, because there is no panel on screen yet at that point.

4. **`ui/UIManager.js` uses `alert()`** for the three static `.quiz-opt` buttons
   in `index.html`. Unrelated to exam mode and unreachable in VR — the DOM is
   hidden during an XR session — but a blocking dialog is the wrong affordance
   on shared hardware.

5. **Windows build trap:** in Git Bash, `BASE_PATH=/acceleration/ npm run build`
   is rewritten by MSYS path conversion into `C:/Program Files/Git/acceleration/`
   and Vite only *warns*. `vite.config.js` now throws on a base that does not
   start and end with `/`. Set it in `.env`, use PowerShell, or take the default.

### Live payloads this was verified against

Fetched from the portal backend via the preview proxy, 2026-08-12:

```json
// GET /api/questions/exam/42  — this module's exam
[{"question_id":57,"question_properties_values":{"target_avg_accel":"20","target_max_velocity":"10","target_peak_altitude":"12"}}]

// GET /api/questions/exam/41  — three questions, nothing gradeable
[{"question_id":54,"question_properties_values":{}},{"question_id":55,"question_properties_values":{}},{"question_id":56,"question_properties_values":{}}]
```

Both are pinned as tests in `ChallengeManager.test.js`. Exams 1, 2 and 40 return
an **empty 200 body** rather than a 404 — `ExamService.fetchQuestions` treats
that as "exam not found" instead of letting `resp.json()` throw.

### Checking targets against the physics

`npm run check:exams [ids | --scan 1-60]` fetches each exam and sweeps the whole
slider space through the real `PhysicsEngine`, reporting how many settings pass
and the gentlest one that does. It only GETs, and it needs a machine that can
reach `LMS_ORIGIN`. Run it after any change to the flight model — a target that
has become unreachable is invisible from the portal, because the module records
a fail and says nothing.

Two results worth carrying forward, from the 2026-09-22 change that replaced
free fall with a coast (`peakAltitude` is now burnout altitude, `flightTime` the
burn duration, `avgAcceleration` exactly `(F - mg)/m`):

- **Exam 42 q57 was unpassable before that change and is fine now.** Under free
  fall the frame-average acceleration was dominated by the descent and came out
  negative — best case `-0.06 m/s^2` against a target of 20 — so **0 of 2050**
  slider combinations could pass. It is now 120 of 2050 at every classroom
  refresh rate, gentlest at 30 N / 1 kg. Its targets need no re-tuning.
- **`target_flight_time` has been removed from `TARGETS_MAP`.** The burn is
  always 200 frames, so flight time is the same number whatever the student
  answers (3.33 s at 60 Hz) — as a target it scored the hardware, not the
  student. The results panel still reports the figure. No live exam used it, so
  no exam changed behaviour; a question that sets it now has that line ignored,
  and one that sets nothing else reports "no usable targets".

Both the altitude and velocity targets still scale with the time-scale slider,
since the burn is counted in frames: at 0.1x the flight is short enough that
exam 42's 12 m altitude target cannot be met. That predates the coast change.
