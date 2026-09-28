import * as React from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { cn } from '@/utils/cn'

interface SelectContextValue {
  value?: string
  onValueChange: (value: string) => void
  setOpen: (open: boolean) => void
}

const SelectContext = React.createContext<SelectContextValue | null>(null)

interface SelectProps {
  value?: string
  onValueChange: (value: string) => void
  children: React.ReactNode
}

export function Select({ value, onValueChange, children }: SelectProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <SelectContext.Provider value={{ value, onValueChange, setOpen }}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        {children}
      </DropdownMenu>
    </SelectContext.Provider>
  )
}

interface SelectTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
  children?: React.ReactNode
}

export const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  SelectTriggerProps
>(({ className, children, ...props }, ref) => {
  return (
    <DropdownMenuTrigger asChild>
      <button
        ref={ref}
        className={cn(
          'flex w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-300',
          className
        )}
        {...props}
      >
        {children}
      </button>
    </DropdownMenuTrigger>
  )
})
SelectTrigger.displayName = 'SelectTrigger'

interface SelectValueProps {
  placeholder?: string
}

export function SelectValue({ placeholder }: SelectValueProps) {
  const ctx = React.useContext(SelectContext)
  const display = ctx?.value ?? ''
  return (
    <span className="text-sm text-zinc-700 truncate">
      {display || placeholder || 'Select option'}
    </span>
  )
}

interface SelectContentProps {
  children: React.ReactNode
  className?: string
}

export function SelectContent({ children, className }: SelectContentProps) {
  return (
    <DropdownMenuContent
      className={cn(
        'w-[var(--radix-dropdown-menu-trigger-width)] max-h-64 overflow-auto z-[100]',
        className
      )}
      align="start"
    >
      {children}
    </DropdownMenuContent>
  )
}

interface SelectItemProps {
  value: string
  children: React.ReactNode
  className?: string
}

export function SelectItem({ value, children, className }: SelectItemProps) {
  const ctx = React.useContext(SelectContext)

  if (!ctx) return null

  return (
    <DropdownMenuItem
      onSelect={() => {
        ctx.onValueChange(value)
        ctx.setOpen(false)
      }}
      className={cn("text-sm", className)}
    >
      {children}
    </DropdownMenuItem>
  )
}
