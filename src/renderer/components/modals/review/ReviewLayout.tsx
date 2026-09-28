import React, { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { cn } from '@/utils/cn'

interface ReviewLayoutProps {
  isOpen: boolean
  onClose: () => void
  progress?: number // 0 to 100
  headerIcon: ReactNode
  title: ReactNode
  description?: ReactNode
  sidebar?: ReactNode
  children: ReactNode
  footer: ReactNode
  className?: string
  contentClassName?: string
}

export function ReviewLayout({
  isOpen,
  onClose,
  progress,
  headerIcon,
  title,
  description,
  sidebar,
  children,
  footer,
  className,
  contentClassName,
}: ReviewLayoutProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          "sm:max-w-4xl p-0 gap-0 overflow-hidden border-none shadow-2xl bg-white rounded-3xl h-[85vh] flex flex-col",
          className
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Top Progress Bar */}
        {progress !== undefined && (
          <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-100 z-50">
            <div
              className="h-full bg-indigo-600 transition-all duration-500 ease-in-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Header */}
        <div className="px-8 py-6 border-b border-zinc-100 bg-white/80 backdrop-blur-md shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="p-2.5 bg-zinc-100 text-zinc-900 rounded-2xl shadow-sm border border-zinc-200/50 shrink-0">
              {headerIcon}
            </div>
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight leading-none">
                {title}
              </h2>
              {description && (
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1">
                  {description}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main Body */}
        <div className="flex flex-1 min-h-0 bg-[#fcfcfc]">
          {sidebar && (
            <div className="w-[200px] flex-shrink-0 border-r border-zinc-100 flex flex-col py-4 gap-1 bg-zinc-50/30">
              {sidebar}
            </div>
          )}
          <div className={cn("flex-1 min-h-0", contentClassName)}>
            {children}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-zinc-100 bg-white flex justify-between items-center shrink-0">
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  )
}
