"use client"

import * as React from "react"
import { cn } from "cn"

import { InputGroupInput } from "./input-group"

/**
 * A field for keys and passwords (ARCH §17.6): a text input drawn as dots, so the browser neither offers to save
 * it as a password nor autofills it, and password managers skip it. Only «set» and «replace» — never shows a
 * stored value. Goes inside an InputGroup.
 */
function SecretInput({
  className,
  value,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const filled = typeof value === "string" ? value.length > 0 : true
  return (
    <InputGroupInput
      autoCapitalize="off"
      autoComplete="off"
      autoCorrect="off"
      className={cn(
        "font-mono",
        filled && "[-webkit-text-security:disc]",
        className
      )}
      data-1p-ignore
      data-bwignore
      data-form-type="other"
      data-lpignore="true"
      data-slot="secret-input"
      spellCheck={false}
      type="text"
      value={value}
      {...props}
    />
  )
}

export { SecretInput }
