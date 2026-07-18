"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  onAddNew?: () => void;
  addNewText?: string;
  id?: string;
}

export function Combobox({ options, value, onChange, placeholder = "Select option...", emptyText = "No option found.", onAddNew, addNewText, id }: ComboboxProps) {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
        />
      }>
        {value
          ? options.find((framework) => framework.value === value)?.label
          : placeholder}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder={`Search...`} />
          <CommandList>
            <CommandEmpty>
              <div className="flex flex-col items-center justify-center py-4 px-2">
                <p className="text-sm text-muted-foreground mb-3">{emptyText}</p>
                {onAddNew && (
                  <Button variant="outline" size="sm" onClick={() => { setOpen(false); onAddNew(); }}>
                    {addNewText || "Add New"}
                  </Button>
                )}
              </div>
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label} // CommandItem filters by text content/value prop. Passing label makes it searchable by label.
                  onSelect={(currentValue) => {
                    onChange(option.value === value ? "" : option.value)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
