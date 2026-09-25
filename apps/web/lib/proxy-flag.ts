/** A country code as its flag emoji (two regional indicator letters); null when there is no code. */
export const flagOf = (country: string | undefined) =>
  country && /^[A-Z]{2}$/u.test(country)
    ? String.fromCodePoint(
        ...[...country].map((c) => 0x1_f1_e6 + (c.codePointAt(0) ?? 65) - 65)
      )
    : null;
