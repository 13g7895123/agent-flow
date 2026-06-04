import React from 'react';

interface SkeletonCardProps {
  count?: number;
  className?: string;
}

const SkeletonLine: React.FC<{ width?: string }> = ({ width = 'w-full' }) => (
  <div className={`${width} h-4 bg-gray-200 rounded animate-pulse`} />
);

export const SkeletonCard: React.FC<SkeletonCardProps> = ({ count = 1, className = '' }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={`bg-white rounded-lg shadow p-4 space-y-3 ${className}`}
        >
          <SkeletonLine width="w-3/4" />
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-5/6" />
          <div className="flex gap-2 pt-2">
            <SkeletonLine width="w-20" />
            <SkeletonLine width="w-20" />
          </div>
        </div>
      ))}
    </>
  );
};

export default SkeletonCard;
