import React from 'react';
import { cn } from '../../utils/cn';

const Button = React.forwardRef(({ className, variant = 'filled', size = 'default', ...props }, ref) => {
    const variants = {
        filled: 'bg-primary text-white hover:bg-primaryVariant shadow-sm hover:shadow-md',
        outlined: 'border border-primary text-primary hover:bg-primary/10',
        text: 'text-primary hover:bg-primary/10',
        ghost: 'text-gray-600 hover:bg-gray-100',
    };

    const sizes = {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-8 text-lg',
        icon: 'h-10 w-10 p-2 flex items-center justify-center',
    };

    return (
        <button
            ref={ref}
            className={cn(
                'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50 uppercase tracking-wider',
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
