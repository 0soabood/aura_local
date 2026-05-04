import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const VARIANT_CLASSES: Record<string, string> = {
  primary: 'btn primary',
  secondary: 'btn',
  danger: 'btn danger',
};

const SIZE_CLASSES: Record<string, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
};

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...props
}) => {
  const cls = ['btn', VARIANT_CLASSES[variant], SIZE_CLASSES[size], className]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
};
