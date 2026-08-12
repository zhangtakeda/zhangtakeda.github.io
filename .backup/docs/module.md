# FusionPRIME 的 Module 设计

Module 是 FusionPRIME 的用户端最主要类型, 负责将用户的物理问题通过内部的 Adapter 转化为 Kernel 可执行的数值计算过程. Module 的作用是将计算逻辑、工作流部件控制、集成建模的部分功能下沉到某一具体物理过程.

Module 根据注册表内部的合法拓扑架构形成对应类型. 并公开暴露同构接口:

```python
module = XxxModule(topology)
state = module.solve(worktree, config)
worktree.record(state)
```

或者 Module 直接在一个完整的状态树中更新 State:

```python
module = XxxModule(topology)
module.solve_into(worktree, config)
```
