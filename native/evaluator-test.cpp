#include "HoldemEvaluator.h"
#include <algorithm>
#include <fstream>
#include <iostream>
#include <map>
#include <numeric>
#include <random>
#include <string>

int main(int argc, char** argv) {
    if (argc != 2) throw std::runtime_error("Pass the upstream five-card dictionary");
    std::ifstream input(argv[1]);
    if (!input) throw std::runtime_error("Cannot read dictionary");
    std::map<int, int> mapped;
    std::array<long long, 9> counts{};
    std::string line, ranks="23456789TJQKA", suits="cdhs";
    long long hands=0;
    while (std::getline(input, line)) {
        auto comma=line.find(',');
        if(comma==std::string::npos) throw std::runtime_error("Invalid fixture line");
        std::vector<int> cards;
        for(size_t i=0;i<comma;i+=3) cards.push_back(int(ranks.find(line[i]))*4+int(suits.find(line[i+1])));
        int actual=holdem::evaluate(cards),expected=std::stoi(line.substr(comma+1));
        auto entry=mapped.emplace(actual,expected);
        if(!entry.second&&entry.first->second!=expected) throw std::runtime_error("Incorrect tie grouping");
        counts[-actual/759375]++; hands++;
    }
    if(hands!=2598960||mapped.size()!=7462) throw std::runtime_error("Incomplete dictionary verification");
    int last=-1;
    for(auto pair:mapped) { if(pair.second<=last) throw std::runtime_error("Incorrect hand ordering"); last=pair.second; }
    if(counts!=std::array<long long,9>{1302540,1098240,123552,54912,10200,5108,3744,624,40}) throw std::runtime_error("Category count mismatch");
    std::mt19937 random(42);
    std::vector<int> deck(52);std::iota(deck.begin(),deck.end(),0);
    for(int n=0;n<100000;n++) {
        std::shuffle(deck.begin(),deck.end(),random);
        std::vector<int> seven(deck.begin(),deck.begin()+7);
        int best=0;
        for(int a=0;a<7;a++)for(int b=a+1;b<7;b++) {
            std::vector<int> five;for(int i=0;i<7;i++)if(i!=a&&i!=b)five.push_back(seven[i]);
            best=std::min(best,holdem::evaluate(five));
        }
        if(holdem::evaluate(seven)!=best)throw std::runtime_error("Seven-card decomposition mismatch");
    }
    std::cout<<"PASS: 2,598,960 upstream five-card values; 7,462 equivalence classes; 100,000 seven-card decompositions\n";
}
