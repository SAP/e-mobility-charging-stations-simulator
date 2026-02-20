# Unresolved Problems

## Task 3: Offline TransactionEvent Queueing (PENDING)

### Key Questions to Answer

1. Where does WebSocket offline detection happen?
2. How does existing messageQueue pattern work?
3. How is seqNo currently tracked and incremented?
4. Where should queue flush logic hook into reconnection flow?
5. What happens to in-flight TransactionEvent messages during disconnect?

### Research Needed

- Explore WebSocket lifecycle hooks (disconnect/connect events)
- Find existing queue implementation patterns
- Understand seqNo persistence across offline periods
- Identify transaction context preservation during offline
- Review OCPP 2.0.1 requirements for offline message ordering

### Potential Risks

- seqNo gaps during offline period
- Message loss if queue not persisted
- Out-of-order delivery on reconnection
- Race conditions during reconnection flood
