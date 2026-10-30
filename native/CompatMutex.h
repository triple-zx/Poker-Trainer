#pragma once
#include <omp.h>
// Local portability shim for MinGW win32-thread builds without std::mutex.
class CompatMutex {
    omp_lock_t value;
public:
    CompatMutex() { omp_init_lock(&value); }
    ~CompatMutex() { omp_destroy_lock(&value); }
    CompatMutex(const CompatMutex&) = delete;
    CompatMutex& operator=(const CompatMutex&) = delete;
    void lock() { omp_set_lock(&value); }
    void unlock() { omp_unset_lock(&value); }
};
