#pragma once
#include <array>
#include <cstdint>
#include <stdexcept>
#include <vector>

// Standard 52-card Hold'em only. Card IDs: rank 2..A, then c,d,h,s.
// Lower scores are stronger, matching TexasSolver's comparator contract.
namespace holdem {
inline int score(int category, const std::array<int, 5>& ranks) {
    int result = category;
    for (int rank : ranks) result = result * 15 + rank;
    return -result;
}
inline int straight(unsigned mask) {
    if (mask & (1u << 14)) mask |= 1u << 1;
    for (int high = 14; high >= 5; --high)
        if (((mask >> (high - 4)) & 31u) == 31u) return high;
    return 0;
}
inline std::array<int, 5> highest(unsigned mask) {
    std::array<int, 5> result{};
    int n = 0;
    for (int rank = 14; rank >= 2 && n < 5; --rank)
        if (mask & (1u << rank)) result[n++] = rank;
    return result;
}
inline int evaluate(const std::vector<int>& cards) {
    if (cards.size() < 5 || cards.size() > 7)
        throw std::invalid_argument("Evaluator requires 5 to 7 cards");
    std::array<int, 15> counts{};
    std::array<int, 4> suitCounts{};
    std::array<unsigned, 4> suits{};
    unsigned mask = 0;
    uint64_t seen = 0;
    for (int card : cards) {
        if (card < 0 || card >= 52 || (seen & (uint64_t(1) << card)))
            throw std::invalid_argument("Invalid or repeated card");
        seen |= uint64_t(1) << card;
        int rank = card / 4 + 2, suit = card % 4;
        counts[rank]++; suitCounts[suit]++;
        suits[suit] |= 1u << rank; mask |= 1u << rank;
    }
    unsigned flush = 0;
    for (int suit = 0; suit < 4; ++suit) if (suitCounts[suit] >= 5) flush = suits[suit];
    if (flush) { int high = straight(flush); if (high) return score(8, {high, 0, 0, 0, 0}); }
    int quad = 0, trip = 0;
    for (int rank = 14; rank >= 2; --rank) {
        if (counts[rank] == 4) quad = rank;
        if (counts[rank] >= 3 && !trip) trip = rank;
    }
    if (quad) return score(7, {quad, highest(mask & ~(1u << quad))[0], 0, 0, 0});
    if (trip) for (int rank = 14; rank >= 2; --rank)
        if (rank != trip && counts[rank] >= 2) return score(6, {trip, rank, 0, 0, 0});
    if (flush) return score(5, highest(flush));
    int high = straight(mask);
    if (high) return score(4, {high, 0, 0, 0, 0});
    if (trip) { auto k = highest(mask & ~(1u << trip)); return score(3, {trip, k[0], k[1], 0, 0}); }
    int first = 0, second = 0;
    for (int rank = 14; rank >= 2; --rank) if (counts[rank] == 2) {
        if (!first) first = rank; else if (!second) second = rank;
    }
    if (second) return score(2, {first, second, highest(mask & ~(1u << first) & ~(1u << second))[0], 0, 0});
    if (first) { auto k = highest(mask & ~(1u << first)); return score(1, {first, k[0], k[1], k[2], 0}); }
    return score(0, highest(mask));
}
}
