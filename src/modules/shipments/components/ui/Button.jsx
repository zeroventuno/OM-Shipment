import React from 'react';
import { cn } from '@/lib/utils';

const Button = React.forwardRef(({ className, variant = 'filled', size = 'default', ...props }, ref) => {
    const variants = {
        filled: 'bg-primary text-primary-foreground hover:bg-primaryVariant',
        outlined: 'border border-primary text-primary hover:bg-primary hover:text-primary-foreground',
        text: 'text-primary hover:bg-secondary',
        ghost: 'text-muted-foreground hover:bg-secondary',
    };

    const sizes = {
        default: 'h-11 px-5 py-2',
        sm: 'h-9 px-4',
        lg: 'h-12 px-8 text-lg',
        icon: 'h-10 w-10 p-2 flex items-center justify-center normal-case tracking-normal',
    };

    return (
        <button
            ref={ref}
            className={cn(
                'inline-flex items-center justify-center gap-2 rounded-full text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 uppercase tracking-[0.1em]',
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        />
    );
});

Button.displayName = 'Button';

export { Button };
