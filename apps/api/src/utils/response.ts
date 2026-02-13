import type { Response } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedData<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export function successResponse<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({
    success: true,
    data,
  });
}

export function errorResponse(
  res: Response,
  message: string,
  statusCode = 400,
  error?: string
): void {
  res.status(statusCode).json({
    success: false,
    error: error ?? 'Error',
    message,
  });
}

export function paginatedResponse<T>(
  res: Response,
  data: T[],
  pagination: { page: number; pageSize: number; totalItems: number }
): void {
  res.status(200).json({
    success: true,
    data,
    pagination: {
      ...pagination,
      totalPages: Math.ceil(pagination.totalItems / pagination.pageSize),
    },
  });
}

export function getPaginationParams(
  query: { page?: string; pageSize?: string },
  defaults = { page: 1, pageSize: 20 }
): PaginationParams {
  return {
    page: Math.max(1, parseInt(query.page ?? String(defaults.page), 10)),
    pageSize: Math.min(100, Math.max(1, parseInt(query.pageSize ?? String(defaults.pageSize), 10))),
  };
}
