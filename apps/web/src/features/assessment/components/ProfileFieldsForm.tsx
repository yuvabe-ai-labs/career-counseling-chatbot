import { useState, type FormEvent, type KeyboardEvent } from "react";
import {
  ArrowRight,
  CalendarDays,
  GraduationCap,
  Globe,
  Lock,
  LogIn,
  Map,
  MapPin,
  User,
  //Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { searchCities, searchStates } from "../api/location";
import { EDUCATION_STAGE_OPTIONS } from "../data";
import { calculateAge, MIN_ELIGIBLE_AGE } from "../domain/age";
import type { ProfileFormValues } from "../types";
import {
  authFormClass,
  fieldIconClass,
  fieldInputClass,
  formSectionClass,
  primaryButtonClass,
} from "./form-styles";

/** Native date input's max — never let today's date register as a valid DOB. */
const todayDateString = (): string => new Date().toISOString().slice(0, 10);

type Errors = Partial<Record<keyof ProfileFormValues, string>>;

/** Figma node 139:3886 ("You must be 12 or older to continue") — Inter Regular 12px, exact. */
function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return <p className="mt-1 font-display text-xs font-normal text-destructive">{message}</p>;
}

/**
 * Step 1 of onboarding — adapted from the prototype's StepOne.tsx, restyled to
 * match the Figma "career" file (node 139:3934, "Tell us about yourself" /
 * "Signup" card, which specs a plain "How old are you?" number field). Adds
 * `selfStage` and `wantsAid`, which that Figma frame doesn't show but
 * `UpsertUserProfileRequestSchema` (packages/contracts/src/profile.ts) requires/accepts.
 *
 * The age field was changed from a typed number to a date-of-birth picker — a deliberate
 * deviation from the Figma frame, not a fidelity slip: the registration redesign requires the
 * backend to compute age reliably from a real date of birth rather than trust a self-reported
 * number (see domain/age.ts and OnboardingPage's use of it), and a typed age number can't
 * support that. Validated 12–100 (age derived from dateOfBirth) to match the real ageBand floor
 * (`AgeBandSchema` starts at "minor_12_13"), not the prototype's 10–60.
 *
 * The student's own email is collected later, on the password-setup screen (SetPasswordForm) —
 * not here — so its availability is checked there instead of gating this step.
 */
export function ProfileFieldsForm({
  value,
  onChange,
  onNext,
}: {
  value: ProfileFormValues;
  onChange: (next: ProfileFormValues) => void;
  onNext: () => void;
}) {
  const [errors, setErrors] = useState<Errors>({});

  const set = <K extends keyof ProfileFormValues>(key: K, next: ProfileFormValues[K]) => {
    onChange({ ...value, [key]: next });
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  /** Selecting a state clears any previously chosen city — it likely doesn't belong to the new state. */
  const handleStateSelect = (option: { value: string; label: string }) => {
    onChange({ ...value, state: option.label, stateCode: option.value, city: "" });
    setErrors((prev) => {
      const next = { ...prev };
      delete next.state;
      delete next.city;
      return next;
    });
  };

  const handleCitySelect = (option: { value: string; label: string }) => {
    set("city", option.label);
  };

  const runSubmit = () => {
    const next: Errors = {};

    if (!value.name.trim()) next.name = "Please tell us your name.";
    else if (value.name.trim().length > 60) next.name = "Name is too long.";

    // The backend independently recomputes age from this dateOfBirth wherever it matters
    // (guardian-consent request, account signup) — this is purely for immediate UI feedback
    // and to decide which Step 2 screen to route to next, not a value the backend trusts.
    if (!value.dateOfBirth) next.dateOfBirth = "Please enter your date of birth.";
    else {
      const age = calculateAge(value.dateOfBirth);
      // Figma node 139:3886 specs this exact copy for the under-12 case — the
      // ageBand floor (`AgeBandSchema` starts at "minor_12_13") is the real
      // constraint; 100 is just a sanity ceiling, not a designed message.
      if (age === null) next.dateOfBirth = "Enter a valid date of birth.";
      else if (age > 100) next.dateOfBirth = "Enter a valid date of birth.";
      else if (age < MIN_ELIGIBLE_AGE) next.dateOfBirth = "You must be 12 or older to continue";
    }

    if (!value.city) next.city = "Please select your city.";
    if (!value.state) next.state = "Please select your state.";
    if (!value.selfStage) next.selfStage = "Please select your current stage.";

    setErrors(next);
    if (Object.keys(next).length === 0) onNext();
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    runSubmit();
  };

  /**
   * A <form>'s implicit Enter-submits-it behavior is unreliable once there's more than one text
   * field and no single one is a natural "default" — true here (name, date of birth) — so Enter
   * is handled explicitly, calling the exact same runSubmit() the Next button's onSubmit does.
   * Guarded by `!event.defaultPrevented` so this never overrides a nested control that already
   * claimed the keypress for its own purpose — the state/city Combobox calls preventDefault() on
   * Enter itself (to open its dropdown or commit a highlighted option), and that must win.
   */
  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (
      event.key === "Enter" &&
      !event.defaultPrevented &&
      event.target instanceof HTMLInputElement
    ) {
      event.preventDefault();
      runSubmit();
    }
  };

  return (
    // Just the fields and actions — the card around them (border, padding, "Signup" title, step
    // dots) is AuthFormCard, shared with every other onboarding screen.
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleFormKeyDown}
      // The email and date inputs' native HTML5 constraints (type="email" format, the date
      // input's max) would otherwise silently block the browser's own submit event before our
      // handler ever runs — confirmed the hard way once already (see GuardianConsentModal's
      // OTP-form Enter fix) — so this form relies entirely on runSubmit()'s own validation,
      // which already covers everything those constraints would and shows it the same way as
      // every other error here (a red FieldError), rather than an unstyled native tooltip.
      noValidate
      className={authFormClass}
    >
      <div className={formSectionClass}>
        <div>
          <Label htmlFor="name" className="text-foreground">
            What should we call you? *
          </Label>
          <div className="relative mt-2">
            <User className={fieldIconClass} aria-hidden="true" />
            <Input
              id="name"
              value={value.name}
              onChange={(event) => set("name", event.target.value)}
              placeholder="Enter your name"
              maxLength={60}
              aria-invalid={Boolean(errors.name)}
              className={fieldInputClass}
            />
          </div>
          <FieldError message={errors.name} />
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
          <div className="sm:flex-1">
            <Label htmlFor="dateOfBirth" className="text-foreground">
              Date of birth *
            </Label>
            <div className="relative mt-2">
              <CalendarDays className={fieldIconClass} aria-hidden="true" />
              <Input
                id="dateOfBirth"
                type="date"
                value={value.dateOfBirth}
                onChange={(event) => set("dateOfBirth", event.target.value)}
                max={todayDateString()}
                autoComplete="bday"
                aria-invalid={Boolean(errors.dateOfBirth)}
                // Empty: the browser's own dd-mm-yyyy hint is a placeholder, so it takes the
                // placeholder colour (see index.css). Once a date is picked it drops back to the
                // normal value colour like any other field.
                className={cn(fieldInputClass, !value.dateOfBirth && "date-placeholder-empty")}
              />
            </div>
            <FieldError message={errors.dateOfBirth} />
          </div>

          <div className="sm:flex-1">
            <Label className="text-foreground">Current stage *</Label>
            <SelectField
              value={value.selfStage}
              onValueChange={(next) => set("selfStage", next as ProfileFormValues["selfStage"])}
              options={EDUCATION_STAGE_OPTIONS}
              placeholder="Select your current stage"
              icon={<GraduationCap className="size-[18px]" />}
              aria-label="Current stage"
              aria-invalid={Boolean(errors.selfStage)}
              className="mt-2"
            />
            <FieldError message={errors.selfStage} />
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:gap-3">
          <div className="sm:flex-1">
            <Label className="text-foreground">State *</Label>
            <Combobox
              label={value.state}
              onSelect={handleStateSelect}
              search={async (query) => {
                const { data } = await searchStates(query);
                return data.map((state) => ({ value: state.code, label: state.name }));
              }}
              placeholder="Type to search your state"
              icon={<Map className="size-[18px]" />}
              aria-label="State"
              aria-invalid={Boolean(errors.state)}
              className="mt-2"
            />
            <FieldError message={errors.state} />
          </div>

          <div className="sm:flex-1">
            <Label className="text-foreground">City *</Label>
            <Combobox
              label={value.city}
              onSelect={handleCitySelect}
              search={async (query) => {
                const { data } = await searchCities(value.stateCode, query);
                return data.map((city) => ({ value: city.id, label: city.name }));
              }}
              placeholder="Type to search your city"
              disabledPlaceholder="Select a state first"
              disabled={!value.stateCode}
              icon={<MapPin className="size-[18px]" />}
              aria-label="City"
              aria-invalid={Boolean(errors.city)}
              className="mt-2"
            />
            <FieldError message={errors.city} />
          </div>
        </div>

        <div>
          <Label className="text-foreground">Country</Label>
          <div className="relative mt-2">
            <Globe className={fieldIconClass} aria-hidden="true" />
            {/* The app is India-only for now, so this is a fixed, read-only value rather than
                  a dropdown with a single option — there's nothing to actually select. */}
            <Input
              value={value.country}
              readOnly
              aria-readonly="true"
              aria-label="Country"
              className={cn(fieldInputClass, "cursor-default text-muted-foreground")}
            />
          </div>
        </div>

        {/*<label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={value.wantsAid}
              onChange={(event) => set("wantsAid", event.target.checked)}
              className="mt-0.5 size-3.5 shrink-0 accent-[var(--color-brand)]"
            />
            <span className="flex items-center gap-1.5">
              <Wallet className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
              I&apos;m interested in financial aid / scholarship options
            </span>
          </label>*/}
      </div>

      <div className={formSectionClass}>
        <Button type="submit" className={primaryButtonClass}>
          Next
          <ArrowRight className="size-[18px]" aria-hidden="true" />
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <LogIn className="size-3.5 shrink-0" aria-hidden="true" />
          Already have an account?{" "}
          <Link to="/sign-in" className="font-semibold text-brand hover:underline">
            Sign In
          </Link>
        </p>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
          We value your privacy. Your details are secure with us.
        </p>
      </div>
    </form>
  );
}
