/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/txsettle_market.json`.
 */
export type TxsettleMarket = {
  "address": "45MwWqTXE9nWN2kyVERpZqRXwr6vDDaMyk9sYudG14qx",
  "metadata": {
    "name": "txsettleMarket",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "TxSettle parimutuel 1X2 market settled trustlessly against TxLINE on-chain Merkle roots"
  },
  "instructions": [
    {
      "name": "claim",
      "docs": [
        "Pay out a winning position pro-rata from the vault",
        "(or refund the original stake when nobody picked the winning outcome)."
      ],
      "discriminator": [
        62,
        198,
        214,
        193,
        213,
        159,
        108,
        210
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "market",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.fixtureId",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    },
    {
      "name": "createMarket",
      "docs": [
        "Open a 1X2 market on a TxLINE fixture. Anyone can create a market;",
        "the creator holds no special rights afterwards."
      ],
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "fixtureId"
              }
            ]
          }
        },
        {
          "name": "mint",
          "docs": [
            "Stake denomination (devnet mock-USDC)."
          ]
        },
        {
          "name": "vault",
          "docs": [
            "Escrow for all stakes. Authority is the market PDA — only `claim` can move funds out."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "fixtureId",
          "type": "i64"
        },
        {
          "name": "closeTs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "place",
      "docs": [
        "Stake `amount` of the market's mint on `outcome` (0 = P1Win, 1 = Draw, 2 = P2Win).",
        "Repeat placements accumulate; switching outcome is rejected."
      ],
      "discriminator": [
        143,
        53,
        56,
        40,
        41,
        16,
        5,
        75
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.fixtureId",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "owner"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "userToken",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": "u8"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "resolve",
      "docs": [
        "Permissionless settlement: verify a TxLINE Merkle stat proof against the",
        "on-chain daily root via txoracle `validate_stat_v2` and derive the outcome",
        "from the proved full-match goal counts."
      ],
      "discriminator": [
        246,
        150,
        236,
        206,
        108,
        63,
        58,
        10
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market.fixtureId",
                "account": "market"
              }
            ]
          }
        },
        {
          "name": "dailyScoresRoots",
          "docs": [
            "`daily_scores_roots` PDA from the proof's own `min_timestamp` under the",
            "txoracle program id and requires this account to match it."
          ]
        },
        {
          "name": "txoracleProgram",
          "address": "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J"
        }
      ],
      "args": [
        {
          "name": "payload",
          "type": {
            "defined": {
              "name": "statValidationInput"
            }
          }
        },
        {
          "name": "strategy",
          "type": {
            "defined": {
              "name": "nDimensionalStrategy"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "closeTsInPast",
      "msg": "close_ts must be in the future"
    },
    {
      "code": 6001,
      "name": "invalidOutcome",
      "msg": "outcome index must be 0 (P1Win), 1 (Draw) or 2 (P2Win)"
    },
    {
      "code": 6002,
      "name": "zeroAmount",
      "msg": "amount must be greater than zero"
    },
    {
      "code": 6003,
      "name": "marketNotOpen",
      "msg": "market is not open"
    },
    {
      "code": 6004,
      "name": "bettingClosed",
      "msg": "betting is closed for this market"
    },
    {
      "code": 6005,
      "name": "outcomeSwitch",
      "msg": "position already staked on a different outcome"
    },
    {
      "code": 6006,
      "name": "marketNotResolved",
      "msg": "market is not resolved yet"
    },
    {
      "code": 6007,
      "name": "alreadyClaimed",
      "msg": "position already claimed"
    },
    {
      "code": 6008,
      "name": "notAWinner",
      "msg": "position did not win this market"
    },
    {
      "code": 6009,
      "name": "fixtureMismatch",
      "msg": "proof fixture id does not match this market"
    },
    {
      "code": 6010,
      "name": "wrongStatKeys",
      "msg": "proof must carry exactly the full-match goal stats (keys 1 and 2, once each)"
    },
    {
      "code": 6011,
      "name": "statNotFinal",
      "msg": "stat leaf is not from a finalised record (period must be 100)"
    },
    {
      "code": 6012,
      "name": "strategyNotExactEquality",
      "msg": "strategy must assert exact equality of every proved stat value"
    },
    {
      "code": 6013,
      "name": "badProofTimestamp",
      "msg": "proof timestamp does not map to a valid epoch day"
    },
    {
      "code": 6014,
      "name": "wrongRootsAccount",
      "msg": "daily_scores_roots account does not match the PDA for the proof's epoch day"
    },
    {
      "code": 6015,
      "name": "proofRejected",
      "msg": "txoracle rejected the settlement proof"
    },
    {
      "code": 6016,
      "name": "overflow",
      "msg": "arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "binaryExpression",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "add"
          },
          {
            "name": "subtract"
          }
        ]
      }
    },
    {
      "name": "comparison",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "greaterThan"
          },
          {
            "name": "lessThan"
          },
          {
            "name": "equalTo"
          }
        ]
      }
    },
    {
      "name": "geometricTarget",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "statIndex",
            "type": "u8"
          },
          {
            "name": "prediction",
            "type": "i32"
          }
        ]
      }
    },
    {
      "name": "market",
      "docs": [
        "One parimutuel 1X2 market per TxLINE fixture.",
        "PDA: `[\"market\", fixture_id (i64 LE)]`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "docs": [
              "TxLINE fixture id this market settles on (matches the proof's `fixture_summary.fixture_id`)."
            ],
            "type": "i64"
          },
          {
            "name": "mint",
            "docs": [
              "SPL mint stakes are denominated in (devnet mock-USDC — never the TxL token)."
            ],
            "type": "pubkey"
          },
          {
            "name": "vault",
            "docs": [
              "Escrow token account; authority is this market PDA itself."
            ],
            "type": "pubkey"
          },
          {
            "name": "closeTs",
            "docs": [
              "Unix seconds; `place` is rejected from this moment on."
            ],
            "type": "i64"
          },
          {
            "name": "state",
            "type": {
              "defined": {
                "name": "marketState"
              }
            }
          },
          {
            "name": "outcome",
            "docs": [
              "Set exactly once by a successful `resolve`."
            ],
            "type": {
              "option": {
                "defined": {
                  "name": "outcome"
                }
              }
            }
          },
          {
            "name": "pools",
            "docs": [
              "Total staked per outcome, index-aligned with `Outcome`."
            ],
            "type": {
              "array": [
                "u64",
                3
              ]
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketState",
      "docs": [
        "Lifecycle of a market. Funds can only enter while `Open` and only leave via",
        "`claim` once `Resolved` — there is no authority that can move them otherwise."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "resolved"
          }
        ]
      }
    },
    {
      "name": "nDimensionalStrategy",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "geometricTargets",
            "type": {
              "vec": {
                "defined": {
                  "name": "geometricTarget"
                }
              }
            }
          },
          {
            "name": "distancePredicate",
            "type": {
              "option": {
                "defined": {
                  "name": "traderPredicate"
                }
              }
            }
          },
          {
            "name": "discretePredicates",
            "type": {
              "vec": {
                "defined": {
                  "name": "statPredicate"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "outcome",
      "docs": [
        "1X2 outcome, index-aligned with `Market::pools`."
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "p1Win"
          },
          {
            "name": "draw"
          },
          {
            "name": "p2Win"
          }
        ]
      }
    },
    {
      "name": "position",
      "docs": [
        "One bettor's stake in one market (a bettor keeps a single outcome per market).",
        "PDA: `[\"pos\", market, owner]`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "docs": [
              "Market this position belongs to (redundant with the PDA seeds; kept for off-chain indexing)."
            ],
            "type": "pubkey"
          },
          {
            "name": "owner",
            "docs": [
              "Bettor (redundant with the PDA seeds; kept for off-chain indexing)."
            ],
            "type": "pubkey"
          },
          {
            "name": "outcome",
            "docs": [
              "`Outcome` index staked on."
            ],
            "type": "u8"
          },
          {
            "name": "amount",
            "docs": [
              "Cumulative stake."
            ],
            "type": "u64"
          },
          {
            "name": "claimed",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "proofNode",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "hash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "isRightSibling",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "scoreStat",
      "docs": [
        "The on-chain representation of a single, provable key-value statistic.",
        "This is the leaf of the inner-most Merkle tree."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "key",
            "type": "u32"
          },
          {
            "name": "value",
            "type": "i32"
          },
          {
            "name": "period",
            "type": "i32"
          }
        ]
      }
    },
    {
      "name": "scoresBatchSummary",
      "docs": [
        "The summary for a single fixture's scores events within a 5-minute batch.",
        "This contains the root of the sub-tree of all events for that fixture."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "fixtureId",
            "type": "i64"
          },
          {
            "name": "updateStats",
            "type": {
              "defined": {
                "name": "scoresUpdateStats"
              }
            }
          },
          {
            "name": "eventsSubTreeRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    },
    {
      "name": "scoresUpdateStats",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "updateCount",
            "type": "i32"
          },
          {
            "name": "minTimestamp",
            "type": "i64"
          },
          {
            "name": "maxTimestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "statLeaf",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "stat",
            "type": {
              "defined": {
                "name": "scoreStat"
              }
            }
          },
          {
            "name": "statProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "statPredicate",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "single",
            "fields": [
              {
                "name": "index",
                "type": "u8"
              },
              {
                "name": "predicate",
                "type": {
                  "defined": {
                    "name": "traderPredicate"
                  }
                }
              }
            ]
          },
          {
            "name": "binary",
            "fields": [
              {
                "name": "indexA",
                "type": "u8"
              },
              {
                "name": "indexB",
                "type": "u8"
              },
              {
                "name": "op",
                "type": {
                  "defined": {
                    "name": "binaryExpression"
                  }
                }
              },
              {
                "name": "predicate",
                "type": {
                  "defined": {
                    "name": "traderPredicate"
                  }
                }
              }
            ]
          }
        ]
      }
    },
    {
      "name": "statValidationInput",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "ts",
            "type": "i64"
          },
          {
            "name": "fixtureSummary",
            "type": {
              "defined": {
                "name": "scoresBatchSummary"
              }
            }
          },
          {
            "name": "fixtureProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          },
          {
            "name": "mainTreeProof",
            "type": {
              "vec": {
                "defined": {
                  "name": "proofNode"
                }
              }
            }
          },
          {
            "name": "eventStatRoot",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "stats",
            "type": {
              "vec": {
                "defined": {
                  "name": "statLeaf"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "traderPredicate",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "threshold",
            "type": "i32"
          },
          {
            "name": "comparison",
            "type": {
              "defined": {
                "name": "comparison"
              }
            }
          }
        ]
      }
    }
  ]
};
