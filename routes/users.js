const { User, Post, validateUser, validateLogin, validatePost } = require('../models/user')
const express = require('express')
const auth = require('../middleware/auth');
const bcrypt = require('bcrypt');
const router = express.Router()
const admin = require('../middleware/admin'); 
const imageMid = require('../middleware/image')
const fileUpload = require('../middleware/file-upload');
//USER Section


//PASCAL GUIDE - creates new user and uploads image via middleware!!!!
router.post("/register", 
  fileUpload.single("image"), 
  async (req, res) => {
    try {
      const {error} = validateUser(req.body);
      if (error) return res.status(400).send(error.details[0].message);
      let user = await User.findOne({email: req.body.email});
      if (user) return res.status(400).send('User already registered.');
      const salt = await bcrypt.genSalt(10);
      user = new User({
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        email: req.body.email,
        password: await bcrypt.hash(req.body.password, salt),
        image: req.file.path
      });
      await user.save();
      const token = user.generateAuthToken();
      return res
        .header("x-auth-token", token)
        .header("access-control-expose-headers", "x-auth-token")
        .send({
          _id: user._id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          image: user.image,
        });
    }catch (ex) {
      return res.status(500).send(`Internal Server Error: ${ex}`);
    }
  });

router.post("/login",  async (req, res) => {
  try {
    const { error } = validateLogin(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    let user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(400).send(`Invalid email or password.`);

    const validPassword = await bcrypt.compare(
      req.body.password,
      user.password
    );
    if (!validPassword)
      return res.status(400).send("Invalid email or password.");

    const token = user.generateAuthToken();
    return res.send(token);
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`);
  }
});

//get all users
router.get("/",  async (req, res) => {
  try {
    const users = await User.find();
    return res.send(users);
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`);
  }
});

//get a users
router.get("/:userId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user)
      return res
        .status(400)
        .send(`User with id ${req.params.userId} does not exist!`);
    return res.send(user);
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`);
  }
});



// put - updates a user
router.put('/:userId', auth, async (req, res) => {
    try {
      const { error } = validateUser(req.body)
      if (error) return res.status(400).send(error)
  
      const user = await User.findById(req.params.userId)
      if (!user) return res.status(400).send(
        `The user with id: "${req.params.userId}" does not exist.`
        )
  
      user.firstName = req.body.firstName;
      user.lastName = req.body.lastName;
      user.aboutMe = req.body.aboutMe;
      user.email = req.body.email;
      user.password = req.body.password;
  
      await user.save()
      return res.send(user)
    } catch (ex) {
      return res.status(500).send(`Internal Server Error: ${ex}`)
  }
})


//Accept friend
router.post("/:userId/pending/:friendId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user)
      return res
        .status(400)
        .send(`The user with id "${req.params.userId}" does not exist.`);
    const friend = await User.findById(req.params.friendId);
    const denied = (index) => index === req.params.friendId;
    if (!friend)
      return res
        .status(400)
        .send(`The friend with id "${req.params.friendId}" does not exist.`);
    if (user.friendsList.includes(friend._id))
      return res
      .status(400)
      .send(`These users are already friends!`);
    user.friendsList.push(friend);
    friend.friendsList.push(user);
    const removeReq = user.pendingRequest.findIndex(denied)
    user.pendingRequest.splice(removeReq, 1)
    await user.save();
    await friend.save();
    return res.send(user.friendsList);
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`);
  }
});

//remove request
router.delete("/:userId/remove/:friendId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user)
      return res
        .status(400)
        .send(`The user with id "${req.params.userId}" does not exist.`);
        const denied = (index) => index === req.params.friendId;
    if (!denied)
      return res
        .status(400)
        .send(`The friend with id "${req.params.friendId}" does not exist.`);
        const removeReq = user.pendingRequest.findIndex(denied)
        user.pendingRequest.splice(removeReq, 1)
    await user.save();
    return res.send(user.pendingRequest);
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`);
  }
});

//Send Friend Request
router.post("/:userId/request/:friendId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user)
      return res
        .status(400)
        .send(`The user with id "${req.params.userId}" does not exist.`);
    const friend = await User.findById(req.params.friendId);
    if (!friend)
      return res
        .status(400)
        .send(`The friend with id "${req.params.friendId}" does not exist.`);
    if (user.friendsList.includes(friend._id))
       return res
      .status(400)
      .send(`These users are already friends!`);
    friend.pendingRequest.push(user);
    await friend.save();
    return res.send(friend.pendingRequest);
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`);
  }
});



// deletes a user
router.delete("/:userId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user)
      return res
        .status(400)
        .send(`User with id ${req.params.userId} does not exist!`);
    await user.remove();
    return res.send(user);
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`);
  }
});


//POSTS section

//adds a post to a user's array of post
router.post('/:userId/posts', auth, async (req, res) => {
  try {
    const { error } = validatePost(req.body)
    if (error) return res.status(400).send(error)

    const user = await User.findById(req.params.userId)
    if (!user) return res.status(400).send(
      `The user with id: "${req.params.userId}" does not exist.`
    )
    
    const post = new Post({
      body: req.body.body,
      likes: req.body.likes,
      disLikes: req.body.disLikes
    })
    user.posts.push(post)
    await user.save()

    return res.send(post)
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`)
  }
})

//get all posts
router.get("/:userId/posts", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user)
      return res
        .status(400)
        .send(`User with id ${req.params.userId} does not exist!`);

    return res.send(user.posts).sort('-dateModified');
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`);
  }
});

//get all posts
router.get("/:userId/posts/date", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user)
      return res
        .status(400)
        .send(`User with id ${req.params.userId} does not exist!`);
  
  user.posts = await User.find().sort({date: 'desc'}).exec((err, docs) => {

    });

    return res.send(user.posts);
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`);
  }
});

//get a single post
router.get("/:userId/posts/:postId", async (req, res) => {
  try {  
    const user = await User.findById(req.params.userId);
    if (!user)
      return res
        .status(400)
        .send(`The user with id "${req.params.userId}" does not exist.`);

    const post = user.posts.id(req.params.postId);
    if (!post)
      return res
        .status(400)
        .send(
          `The post with id "${req.params.postId}" does not in the users posts.`
        );

    return res.send(post);
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`);
  }
});


//edits a post
router.put("/:userId/posts/:postId", async (req, res) => {
  try {
    const { error } = validatePost(req.body);
    if (error) return res.status(400).send(error);

    const user = await User.findById(req.params.userId);
    if (!user)
      return res
        .status(400)
        .send(`The user with id "${req.params.userId}" does not exist.`);

    const post = user.posts.id(req.params.postId);
    if (!post)
      return res
        .status(400)
        .send(
          `The post with id "${req.params.postId}" does not in the users posts.`
        );

    post.body =  req.body.body;
    post.likes =  req.body.likes;
    post.disLikes =  req.body.dislikes;
    post.picture =  req.body.picture;
    post.dateModified =  Date.now();
    

    await user.save();
    return res.send(post);
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`);
  }
});

//delete a post
router.delete("/:userId/posts/:postId", [auth], async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user)
      return res
        .status(400)
        .send(`User with id ${req.params.userId} does not exist!`);

    let post = user.posts.id(req.params.postId);
    if(!post)
      return res
        .status(400)
        .send(`Post with id ${req.params.postId} does not exist!`);

    post = await post.remove();
    await user.save();
    return res.send(user);
  } catch (ex) {
    return res.status(500).send(`Internal Server Error: ${ex}`);
  }
});



module.exports = router
